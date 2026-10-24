// Sree Deck — a floating, always-on-top Stream Deck for the Mac.
//
// The window never takes focus (non-activating panel), so typing keys land in the app you're working in.
// Keys and their live images come from the Node host (host/host.js), which runs the Stream Deck plugins.
// ⌃⌥⌘Space shows/hides the deck; the menu-bar icon has Show/Hide, Edit Keys, Reload and Quit.
import AppKit
import ApplicationServices
import Carbon.HIToolbox
import ServiceManagement

let keySize: CGFloat = 88
let gap: CGFloat = 10
let pad: CGFloat = 12

// MARK: - Key view

final class KeyView: NSView {
  let index: Int
  var onPress: ((Int, Bool) -> Void)?
  private let imageLayer = CALayer()
  private let flashLayer = CATextLayer()

  init(index: Int) {
    self.index = index
    super.init(frame: NSRect(x: 0, y: 0, width: keySize, height: keySize))
    wantsLayer = true
    layer?.cornerRadius = 14
    layer?.masksToBounds = true
    layer?.backgroundColor = NSColor(white: 0.08, alpha: 1).cgColor
    imageLayer.frame = bounds
    imageLayer.contentsGravity = .resizeAspectFill
    layer?.addSublayer(imageLayer)
    flashLayer.frame = bounds
    flashLayer.alignmentMode = .center
    flashLayer.fontSize = 44
    flashLayer.contentsScale = 2
    flashLayer.opacity = 0
    layer?.addSublayer(flashLayer)
  }
  required init?(coder: NSCoder) { fatalError() }

  func setImage(_ image: NSImage?) {
    imageLayer.contents = image?.cgImage(forProposedRect: nil, context: nil, hints: nil)
  }

  func flash(ok: Bool) {
    flashLayer.string = ok ? "✓" : "!"
    flashLayer.backgroundColor = (ok ? NSColor.systemGreen : NSColor.systemRed).withAlphaComponent(0.55).cgColor
    let a = CABasicAnimation(keyPath: "opacity")
    a.fromValue = 1; a.toValue = 0; a.duration = 0.8
    flashLayer.add(a, forKey: "flash")
  }

  // Clicks work without activating the app or needing a first click to focus the window.
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  override func mouseDown(with event: NSEvent) {
    layer?.transform = CATransform3DMakeScale(0.93, 0.93, 1)
    onPress?(index, true)
  }
  override func mouseUp(with event: NSEvent) {
    layer?.transform = CATransform3DIdentity
    onPress?(index, false)
  }
}

// MARK: - Panel (drag it by the dark border)

final class DeckPanel: NSPanel {
  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

final class Background: NSView {
  override var mouseDownCanMoveWindow: Bool { true }
  override func draw(_ dirtyRect: NSRect) {
    NSColor(white: 0.02, alpha: 0.96).setFill()
    NSBezierPath(roundedRect: bounds, xRadius: 20, yRadius: 20).fill()
  }
}

// MARK: - Host process (Node)

final class Host {
  var onMessage: (([String: Any]) -> Void)?
  private var proc: Process?
  private var stdin: FileHandle?
  private var buffer = Data()

  static func nodePath() -> String? {
    let fm = FileManager.default
    let sd = NSHomeDirectory() + "/Library/Application Support/com.elgato.StreamDeck/NodeJS"
    let bundled = ((try? fm.contentsOfDirectory(atPath: sd)) ?? []).filter { $0.hasPrefix("24") }.sorted().last.map { "\(sd)/\($0)/node" }
    let nvm = NSHomeDirectory() + "/.nvm/versions/node"
    let nvm24 = ((try? fm.contentsOfDirectory(atPath: nvm)) ?? []).filter { $0.hasPrefix("v24") }.sorted().last.map { "\(nvm)/\($0)/bin/node" }
    return [bundled, nvm24, "/opt/homebrew/bin/node", "/usr/local/bin/node"].compactMap { $0 }.first { fm.isExecutableFile(atPath: $0) }
  }

  func start() {
    guard let node = Host.nodePath(), let script = Bundle.main.path(forResource: "host/host", ofType: "js") else {
      NSLog("SreeDeck: node or host.js missing"); return
    }
    let p = Process()
    p.executableURL = URL(fileURLWithPath: node)
    p.arguments = [script]
    p.currentDirectoryURL = URL(fileURLWithPath: (script as NSString).deletingLastPathComponent)
    let inPipe = Pipe(), outPipe = Pipe()
    p.standardInput = inPipe
    p.standardOutput = outPipe
    p.standardError = FileHandle(forWritingAtPath: "/dev/null")
    outPipe.fileHandleForReading.readabilityHandler = { [weak self] h in
      let d = h.availableData
      DispatchQueue.main.async { self?.consume(d) }
    }
    p.terminationHandler = { [weak self] _ in
      DispatchQueue.main.asyncAfter(deadline: .now() + 2) { if self?.proc === p { self?.start() } }  // restart if it dies
    }
    try? p.run()
    proc = p
    stdin = inPipe.fileHandleForWriting
  }

  func stop() {
    let p = proc
    proc = nil
    p?.terminate()
  }

  func send(_ msg: [String: Any]) {
    guard let d = try? JSONSerialization.data(withJSONObject: msg) else { return }
    stdin?.write(d + Data("\n".utf8))
  }

  private func consume(_ d: Data) {
    buffer.append(d)
    while let nl = buffer.firstIndex(of: 0x0A) {
      let line = buffer[buffer.startIndex..<nl]
      buffer.removeSubrange(buffer.startIndex...nl)
      if let obj = try? JSONSerialization.jsonObject(with: line) as? [String: Any] { onMessage?(obj) }
    }
  }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate {
  var panel: DeckPanel!
  var keys: [KeyView] = []
  var images: [Int: NSImage] = [:]
  let host = Host()
  var status: NSStatusItem!
  var hotKey: EventHotKeyRef?

  func applicationDidFinishLaunching(_ n: Notification) {
    panel = DeckPanel(contentRect: .zero, styleMask: [.nonactivatingPanel, .borderless], backing: .buffered, defer: false)
    panel.level = .floating
    panel.isFloatingPanel = true
    panel.hidesOnDeactivate = false
    panel.isMovableByWindowBackground = true
    panel.backgroundColor = .clear
    panel.isOpaque = false
    panel.hasShadow = true
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
    panel.contentView = Background()
    layout(columns: 4, rows: 2)
    restorePosition()
    panel.orderFrontRegardless()
    NotificationCenter.default.addObserver(forName: NSWindow.didMoveNotification, object: panel, queue: .main) { [weak self] _ in self?.savePosition() }

    host.onMessage = { [weak self] m in self?.handle(m) }
    host.start()
    setupMenu()
    registerHotKey()
    // typing prompts and pressing shortcuts for you needs Accessibility; ask once (macOS shows its own dialog)
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    _ = AXIsProcessTrustedWithOptions(opts)
  }

  func applicationWillTerminate(_ n: Notification) { host.stop() }

  func layout(columns: Int, rows: Int) {
    keys.forEach { $0.removeFromSuperview() }
    keys = []
    let w = pad * 2 + CGFloat(columns) * keySize + CGFloat(columns - 1) * gap
    let h = pad * 2 + CGFloat(rows) * keySize + CGFloat(rows - 1) * gap
    let origin = panel.frame.origin
    panel.setFrame(NSRect(x: origin.x, y: origin.y + panel.frame.height - h, width: w, height: h), display: true)
    for i in 0..<(columns * rows) {
      let k = KeyView(index: i)
      let c = i % columns, r = i / columns
      k.frame.origin = NSPoint(x: pad + CGFloat(c) * (keySize + gap), y: h - pad - keySize - CGFloat(r) * (keySize + gap))
      k.onPress = { [weak self] i, down in self?.host.send(["t": down ? "down" : "up", "i": i]) }
      k.setImage(images[i])
      panel.contentView?.addSubview(k)
      keys.append(k)
    }
  }

  func handle(_ m: [String: Any]) {
    switch m["t"] as? String {
    case "layout":
      layout(columns: m["columns"] as? Int ?? 4, rows: m["rows"] as? Int ?? 2)
    case "img":
      guard let i = m["i"] as? Int, i < keys.count else { return }
      let png = m["png"] as? String ?? ""
      let img = png.isEmpty ? nil : Data(base64Encoded: png).flatMap(NSImage.init(data:))
      images[i] = img
      keys[i].setImage(img)
    case "flash":
      guard let i = m["i"] as? Int, i < keys.count else { return }
      keys[i].flash(ok: (m["kind"] as? String) == "ok")
    case "log":
      NSLog("SreeDeck host: %@", m["msg"] as? String ?? "")
    default: break
    }
  }

  // MARK: position
  func savePosition() {
    UserDefaults.standard.set(NSStringFromPoint(panel.frame.origin), forKey: "origin")
  }
  func restorePosition() {
    if let s = UserDefaults.standard.string(forKey: "origin") {
      panel.setFrameOrigin(NSPointFromString(s))
    } else if let screen = NSScreen.main?.visibleFrame {
      panel.setFrameOrigin(NSPoint(x: screen.maxX - panel.frame.width - 24, y: screen.minY + 24))
    }
  }

  // MARK: menu bar
  func setupMenu() {
    status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    status.button?.title = "🎛"
    let menu = NSMenu()
    menu.addItem(withTitle: "Show / Hide  (⌃⌥⌘Space)", action: #selector(toggle), keyEquivalent: "")
    menu.addItem(withTitle: "Edit Keys…", action: #selector(editKeys), keyEquivalent: "")
    menu.addItem(withTitle: "Reload", action: #selector(reload), keyEquivalent: "")
    let login = menu.addItem(withTitle: "Launch at Login", action: #selector(toggleLogin), keyEquivalent: "")
    login.state = SMAppService.mainApp.status == .enabled ? .on : .off
    menu.addItem(.separator())
    menu.addItem(withTitle: "Quit Sree Deck", action: #selector(quit), keyEquivalent: "")
    menu.items.forEach { $0.target = self }
    status.menu = menu
  }
  @objc func toggle() { panel.isVisible ? panel.orderOut(nil) : panel.orderFrontRegardless() }
  @objc func editKeys() { NSWorkspace.shared.open(URL(fileURLWithPath: NSHomeDirectory() + "/.config/sree-deck/deck.json")) }
  @objc func reload() { host.send(["t": "reload"]) }
  @objc func quit() { NSApp.terminate(nil) }
  @objc func toggleLogin(_ item: NSMenuItem) {
    let svc = SMAppService.mainApp
    try? (svc.status == .enabled ? svc.unregister() : svc.register())
    item.state = svc.status == .enabled ? .on : .off
  }

  // MARK: global hotkey ⌃⌥⌘Space (Carbon: no Accessibility permission needed)
  func registerHotKey() {
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), { _, _, ctx in
      let me = Unmanaged<AppDelegate>.fromOpaque(ctx!).takeUnretainedValue()
      DispatchQueue.main.async { me.toggle() }
      return noErr
    }, 1, &spec, Unmanaged.passUnretained(self).toOpaque(), nil)
    let id = EventHotKeyID(signature: OSType(0x5344_4B31), id: 1)  // "SDK1"
    RegisterEventHotKey(UInt32(kVK_Space), UInt32(cmdKey | optionKey | controlKey), id, GetApplicationEventTarget(), 0, &hotKey)
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)  // lives in the menu bar + floating panel, never steals focus
app.run()
