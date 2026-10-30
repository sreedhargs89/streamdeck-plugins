// Agents — a tiny menu-bar indicator for herdr agents.
//
// Menu bar:  🔴2 🔵1 🟢1   (needs you · running · just finished); a dim ◦ when everything is idle.
// Click:     the tabs grouped by state; pick one to jump to it in the terminal.
// Notifies:  "<tab> needs you" when an agent gets blocked, "<tab> finished" when one finishes — not for the tab
//            you're already looking at. Clicking the notification jumps to that tab.
// Reads `herdr api snapshot` every 1.5 s; jumps with `herdr tab focus <id>` + activating the terminal.
import AppKit
import ServiceManagement
import UserNotifications

let pollSeconds = 1.5
let recentDoneSeconds: TimeInterval = 10 * 60  // a finished tab counts as "just finished" this long

struct Tab {
  let id: String, label: String, status: String, task: String, focused: Bool
}

// MARK: - herdr

enum Herdr {
  static let bin: String = {
    let home = NSHomeDirectory()
    let config = (try? JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: home + "/.config/streamdeck-herdr.json")))) as? [String: Any]
    return [config?["herdr"] as? String, home + "/.local/bin/herdr", "/opt/homebrew/bin/herdr", "/usr/local/bin/herdr"]
      .compactMap { $0 }.first { FileManager.default.isExecutableFile(atPath: $0) } ?? "herdr"
  }()
  static let terminal: String = {
    let config = (try? JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: NSHomeDirectory() + "/.config/streamdeck-herdr.json")))) as? [String: Any]
    return config?["terminal"] as? String ?? "Ghostty"
  }()

  static func run(_ args: [String]) -> Data? {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: bin)
    p.arguments = args
    let out = Pipe()
    p.standardOutput = out
    p.standardError = FileHandle.nullDevice
    do { try p.run() } catch { return nil }
    let data = out.fileHandleForReading.readDataToEndOfFile()
    p.waitUntilExit()
    return p.terminationStatus == 0 ? data : nil
  }

  static func snapshot() -> [Tab]? {
    guard let data = run(["api", "snapshot"]),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let snap = (json["result"] as? [String: Any])?["snapshot"] as? [String: Any] else { return nil }
    var titles: [String: String] = [:]
    for a in snap["agents"] as? [[String: Any]] ?? [] {
      if let t = a["tab_id"] as? String, titles[t] == nil { titles[t] = a["terminal_title_stripped"] as? String ?? "" }
    }
    let focused = snap["focused_tab_id"] as? String
    let wsOrder = Dictionary(uniqueKeysWithValues: ((snap["workspaces"] as? [[String: Any]]) ?? []).enumerated().compactMap { i, w in (w["workspace_id"] as? String).map { ($0, i) } })
    return ((snap["tabs"] as? [[String: Any]]) ?? [])
      .sorted { (wsOrder[$0["workspace_id"] as? String ?? ""] ?? 0, $0["number"] as? Int ?? 0) < (wsOrder[$1["workspace_id"] as? String ?? ""] ?? 0, $1["number"] as? Int ?? 0) }
      .compactMap { t in
        guard let id = t["tab_id"] as? String else { return nil }
        let task = (titles[id] ?? "").replacingOccurrences(of: #"^[^\p{L}\p{N}]+"#, with: "", options: .regularExpression)
        return Tab(id: id, label: t["label"] as? String ?? "Tab \(t["number"] ?? "")", status: t["agent_status"] as? String ?? "unknown",
                   task: task, focused: id == focused)
      }
  }

  static func focus(_ id: String) {
    DispatchQueue.global().async {
      _ = run(["tab", "focus", id])
      let open = Process()
      open.executableURL = URL(fileURLWithPath: "/usr/bin/open")
      open.arguments = ["-a", terminal]
      try? open.run()
    }
  }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate, NSMenuDelegate {
  let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  var tabs: [Tab] = []
  var previous: [String: String] = [:]  // tab id -> last status
  var finishedAt: [String: Date] = [:]  // tab id -> when it finished (for 🟢)
  var online = true
  var first = true

  func applicationDidFinishLaunching(_ n: Notification) {
    item.button?.font = NSFont.monospacedDigitSystemFont(ofSize: 13, weight: .medium)
    item.menu = NSMenu()
    item.menu?.delegate = self
    UNUserNotificationCenter.current().delegate = self
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    refresh()
    Timer.scheduledTimer(withTimeInterval: pollSeconds, repeats: true) { [weak self] _ in self?.refresh() }
  }

  func refresh() {
    DispatchQueue.global(qos: .utility).async {
      let snap = Herdr.snapshot()
      DispatchQueue.main.async { self.update(snap) }
    }
  }

  func update(_ snap: [Tab]?) {
    guard let snap else { online = false; draw(); return }
    online = true
    let terminalFront = NSWorkspace.shared.frontmostApplication?.localizedName == Herdr.terminal
    let now = Date()
    for t in snap {
      let before = previous[t.id]
      if t.status == "working" || t.status == "blocked" { finishedAt[t.id] = nil }
      if before == "working" && (t.status == "done" || t.status == "idle") { finishedAt[t.id] = now }
      if t.status == "done" && finishedAt[t.id] == nil && before != nil && before != "done" { finishedAt[t.id] = now }
      // notify on changes (not on the first poll, and not for the tab you're looking at)
      if !first, let before, before != t.status, !(t.focused && terminalFront) {
        if t.status == "blocked" { notify(t, title: "⚠️ \(t.label) needs you") }
        else if before == "working" && (t.status == "done" || t.status == "idle") { notify(t, title: "✓ \(t.label) finished") }
      }
      previous[t.id] = t.status
    }
    let live = Set(snap.map(\.id))
    previous = previous.filter { live.contains($0.key) }
    finishedAt = finishedAt.filter { live.contains($0.key) && now.timeIntervalSince($0.value) < recentDoneSeconds && previous[$0.key] != "working" }
    tabs = snap
    first = false
    draw()
  }

  func justFinished(_ t: Tab) -> Bool { t.status == "done" || finishedAt[t.id] != nil }
  var needs: [Tab] { tabs.filter { $0.status == "blocked" } }
  var running: [Tab] { tabs.filter { $0.status == "working" } }
  var finished: [Tab] { tabs.filter { $0.status != "blocked" && $0.status != "working" && justFinished($0) } }

  func draw() {
    guard let button = item.button else { return }
    guard online else { button.title = "◦ herdr off"; return }
    var parts: [String] = []
    if !needs.isEmpty { parts.append("🔴\(needs.count)") }
    if !running.isEmpty { parts.append("🔵\(running.count)") }
    if !finished.isEmpty { parts.append("🟢\(finished.count)") }
    button.title = parts.isEmpty ? "◦" : parts.joined(separator: " ")
    button.toolTip = "\(needs.count) need you · \(running.count) running · \(finished.count) just finished"
  }

  // MARK: menu (rebuilt each time it opens)
  func menuNeedsUpdate(_ menu: NSMenu) {
    menu.removeAllItems()
    if !online {
      menu.addItem(withTitle: "herdr is not running", action: nil, keyEquivalent: "")
    } else {
      section(menu, "Needs you", needs, "🔴")
      section(menu, "Running", running, "🔵")
      section(menu, "Just finished", finished, "🟢")
      let rest = tabs.filter { t in !needs.contains { $0.id == t.id } && !running.contains { $0.id == t.id } && !finished.contains { $0.id == t.id } }
      if !rest.isEmpty {
        let sub = NSMenu()
        rest.forEach { sub.addItem(tabItem($0, "◦")) }
        let idle = menu.addItem(withTitle: "Idle (\(rest.count))", action: nil, keyEquivalent: "")
        menu.setSubmenu(sub, for: idle)
      }
    }
    menu.addItem(.separator())
    let login = menu.addItem(withTitle: "Launch at Login", action: #selector(toggleLogin), keyEquivalent: "")
    login.target = self
    login.state = SMAppService.mainApp.status == .enabled ? .on : .off
    let quit = menu.addItem(withTitle: "Quit Agents", action: #selector(quit), keyEquivalent: "q")
    quit.target = self
  }

  func section(_ menu: NSMenu, _ title: String, _ list: [Tab], _ dot: String) {
    guard !list.isEmpty else { return }
    let header = menu.addItem(withTitle: title, action: nil, keyEquivalent: "")
    header.isEnabled = false
    list.forEach { menu.addItem(tabItem($0, dot)) }
    menu.addItem(.separator())
  }

  func tabItem(_ t: Tab, _ dot: String) -> NSMenuItem {
    let task = t.task.isEmpty ? "" : " — \(t.task.prefix(48))"
    let it = NSMenuItem(title: "\(dot) \(t.label)\(task)", action: #selector(jump(_:)), keyEquivalent: "")
    it.target = self
    it.representedObject = t.id
    if t.focused { it.state = .on }
    return it
  }

  @objc func jump(_ sender: NSMenuItem) { if let id = sender.representedObject as? String { Herdr.focus(id) } }
  @objc func quit() { NSApp.terminate(nil) }
  @objc func toggleLogin(_ item: NSMenuItem) {
    let svc = SMAppService.mainApp
    try? (svc.status == .enabled ? svc.unregister() : svc.register())
    item.state = svc.status == .enabled ? .on : .off
  }

  // MARK: notifications
  func notify(_ t: Tab, title: String) {
    let c = UNMutableNotificationContent()
    c.title = title
    c.body = t.task.isEmpty ? "Click to open the tab." : t.task
    c.sound = .default
    c.userInfo = ["tab": t.id]
    UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "\(t.id)-\(Date().timeIntervalSince1970)", content: c, trigger: nil))
  }
  func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse, withCompletionHandler done: @escaping () -> Void) {
    if let id = r.notification.request.content.userInfo["tab"] as? String { Herdr.focus(id) }
    done()
  }
  func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification, withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
    done([.banner, .sound])
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
