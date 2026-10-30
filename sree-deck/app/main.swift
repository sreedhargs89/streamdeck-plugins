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
let bar: CGFloat = 16  // strip along the top for the close / minimize buttons

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

// MARK: - Window buttons (close / minimize) and the minimized pill

final class WindowButton: NSView {
  let color: NSColor, symbol: String, action: () -> Void
  private var hover = false
  init(color: NSColor, symbol: String, action: @escaping () -> Void) {
    self.color = color; self.symbol = symbol; self.action = action
    super.init(frame: NSRect(x: 0, y: 0, width: 13, height: 13))
    addTrackingArea(NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self))
  }
  required init?(coder: NSCoder) { fatalError() }
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  override func mouseEntered(with e: NSEvent) { hover = true; needsDisplay = true }
  override func mouseExited(with e: NSEvent) { hover = false; needsDisplay = true }
  override func mouseDown(with e: NSEvent) {}
  override func mouseUp(with e: NSEvent) { if bounds.contains(convert(e.locationInWindow, from: nil)) { action() } }
  override func draw(_ r: NSRect) {
    color.setFill(); NSBezierPath(ovalIn: bounds.insetBy(dx: 0.5, dy: 0.5)).fill()
    guard hover else { return }
    let a: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 10, weight: .bold), .foregroundColor: NSColor(white: 0, alpha: 0.6)]
    let t = NSAttributedString(string: symbol, attributes: a), sz = t.size()
    t.draw(at: NSPoint(x: (bounds.width - sz.width) / 2, y: (bounds.height - sz.height) / 2))
  }
}

/** The deck when minimized: a small 🎛 pill. Click to expand, drag to move. */
final class PillView: NSView {
  var onClick: (() -> Void)?
  private var start: NSPoint?, moved = false
  override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
  override func draw(_ r: NSRect) {
    NSColor(white: 0.02, alpha: 0.96).setFill()
    NSBezierPath(roundedRect: bounds, xRadius: bounds.height / 2, yRadius: bounds.height / 2).fill()
    let t = NSAttributedString(string: "🎛", attributes: [.font: NSFont.systemFont(ofSize: 22)]), sz = t.size()
    t.draw(at: NSPoint(x: (bounds.width - sz.width) / 2, y: (bounds.height - sz.height) / 2))
  }
  override func mouseDown(with e: NSEvent) { start = NSEvent.mouseLocation; moved = false }
  override func mouseDragged(with e: NSEvent) {
    guard let s = start, let w = window else { return }
    let now = NSEvent.mouseLocation
    w.setFrameOrigin(NSPoint(x: w.frame.origin.x + now.x - s.x, y: w.frame.origin.y + now.y - s.y))
    start = now; moved = true
  }
  override func mouseUp(with e: NSEvent) { if !moved { onClick?() } }
}

// MARK: - Panel (drag it by the dark border)

final class DeckPanel: NSPanel {
  override var canBecomeKey: Bool { false }
  override var canBecomeMain: Bool { false }
}

final class Background: NSView {
  var pillMode = false
  override var mouseDownCanMoveWindow: Bool { true }
  override func draw(_ dirtyRect: NSRect) {
    guard !pillMode else { return }
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
    let dev = UserDefaults.standard.string(forKey: "HostPath").flatMap { FileManager.default.fileExists(atPath: $0) ? $0 : nil }
    guard let node = Host.nodePath(), let script = dev ?? Bundle.main.path(forResource: "host/host", ofType: "js") else {
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
  var dims = (columns: 4, rows: 2)
  var minimized = false
  let pill = PillView(frame: NSRect(x: 0, y: 0, width: 56, height: 40))
  lazy var buttons: [WindowButton] = [
    WindowButton(color: NSColor(red: 1, green: 0.37, blue: 0.34, alpha: 1), symbol: "×") { [weak self] in self?.close() },
    WindowButton(color: NSColor(red: 1, green: 0.74, blue: 0.18, alpha: 1), symbol: "−") { [weak self] in self?.minimize() },
  ]

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
    pill.onClick = { [weak self] in self?.expand() }
    panel.orderFrontRegardless()
    NotificationCenter.default.addObserver(forName: NSWindow.didMoveNotification, object: panel, queue: .main) { [weak self] _ in self?.savePosition() }

    host.onMessage = { [weak self] m in self?.handle(m) }
    host.start()
    setupMenu()
    registerHotKey()
    // Typing prompts and pressing shortcuts needs Accessibility. Ask macOS only once ever; after that, a missing
    // permission just shows in the menu-bar menu (the app is signed with a stable identity, so a grant survives rebuilds).
    if !AXIsProcessTrusted() && !UserDefaults.standard.bool(forKey: "askedAccessibility") {
      UserDefaults.standard.set(true, forKey: "askedAccessibility")
      let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
      _ = AXIsProcessTrustedWithOptions(opts)
    }
  }

  func applicationWillTerminate(_ n: Notification) { host.stop() }

  func layout(columns: Int, rows: Int) {
    dims = (columns, rows)
    if minimized { return }  // applied when the deck is expanded again
    keys.forEach { $0.removeFromSuperview() }
    keys = []
    let w = pad * 2 + CGFloat(columns) * keySize + CGFloat(columns - 1) * gap
    let h = pad * 2 + bar + CGFloat(rows) * keySize + CGFloat(rows - 1) * gap
    let top = NSPoint(x: panel.frame.minX, y: panel.frame.maxY)  // grow/shrink downwards, top-left stays put
    panel.setFrame(NSRect(x: top.x, y: top.y - h, width: w, height: h), display: true)
    for (n, b) in buttons.enumerated() {
      b.frame.origin = NSPoint(x: pad + CGFloat(n) * 19, y: h - pad + 2 - b.frame.height)
      if b.superview == nil { panel.contentView?.addSubview(b) }
    }
    for i in 0..<(columns * rows) {
      let k = KeyView(index: i)
      let c = i % columns, r = i / columns
      k.frame.origin = NSPoint(x: pad + CGFloat(c) * (keySize + gap), y: h - pad - bar - keySize - CGFloat(r) * (keySize + gap))
      k.onPress = { [weak self] i, down in self?.host.send(["t": down ? "down" : "up", "i": i]) }
      k.setImage(images[i])
      panel.contentView?.addSubview(k)
      keys.append(k)
    }
  }

  func handle(_ m: [String: Any]) {
    switch m["t"] as? String {
    case "layout":
      columns = m["columns"] as? Int ?? 4
      layout(columns: columns, rows: m["rows"] as? Int ?? 2)
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
    UserDefaults.standard.set(NSStringFromPoint(NSPoint(x: panel.frame.minX, y: panel.frame.maxY)), forKey: "topLeft")
  }
  func restorePosition() {
    if let s = UserDefaults.standard.string(forKey: "topLeft") {
      panel.setFrameTopLeftPoint(NSPointFromString(s))
    } else if let s = UserDefaults.standard.string(forKey: "origin") {
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
    if !AXIsProcessTrusted() {
      menu.addItem(withTitle: "⚠️ Allow Accessibility (for typing keys)…", action: #selector(openAccessibility), keyEquivalent: "")
      menu.addItem(.separator())
    }
    menu.addItem(withTitle: "Show / Hide  (⌃⌥⌘Space)", action: #selector(toggle), keyEquivalent: "")
    menu.addItem(withTitle: "Home", action: #selector(home), keyEquivalent: "")
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

  /** Close = hide (⌃⌥⌘Space or the menu-bar icon brings it back); the app keeps running. */
  func close() { panel.orderOut(nil) }

  /** Minimize = shrink to a 🎛 pill at the same corner; click the pill to expand. */
  func minimize() {
    guard !minimized else { return }
    minimized = true
    panel.contentView?.subviews.forEach { $0.isHidden = true }
    let top = NSPoint(x: panel.frame.minX, y: panel.frame.maxY)
    panel.setFrame(NSRect(x: top.x, y: top.y - pill.frame.height, width: pill.frame.width, height: pill.frame.height), display: true)
    pill.frame.origin = .zero
    pill.isHidden = false
    if pill.superview == nil { panel.contentView?.addSubview(pill) }
    (panel.contentView as? Background)?.pillMode = true
    panel.contentView?.needsDisplay = true
  }

  func expand() {
    guard minimized else { return }
    minimized = false
    pill.isHidden = true
    (panel.contentView as? Background)?.pillMode = false
    panel.contentView?.subviews.forEach { if $0 !== pill { $0.isHidden = false } }
    layout(columns: dims.columns, rows: dims.rows)
    panel.contentView?.needsDisplay = true
  }
  @objc func editKeys() { NSWorkspace.shared.open(URL(fileURLWithPath: NSHomeDirectory() + "/.config/sree-deck/deck.json")) }
  @objc func reload() { host.send(["t": "reload"]) }
  @objc func home() { host.send(["t": "home"]) }
  @objc func quit() { NSApp.terminate(nil) }
  @objc func openAccessibility() {
    NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
  }
  @objc func toggleLogin(_ item: NSMenuItem) {
    let svc = SMAppService.mainApp
    try? (svc.status == .enabled ? svc.unregister() : svc.register())
    item.state = svc.status == .enabled ? .on : .off
  }

  // MARK: global hotkeys (Carbon: no Accessibility permission needed)
  //   ⌃⌥⌘Space  show/hide
  //   ⌃⌥1 … ⌃⌥8  press the keys in row 1;  ⌃⌥Q … ⌃⌥I  row 2  (held = key held, so hold-to-talk works)
  static let rowKeys: [[Int]] = [
    [kVK_ANSI_1, kVK_ANSI_2, kVK_ANSI_3, kVK_ANSI_4, kVK_ANSI_5, kVK_ANSI_6, kVK_ANSI_7, kVK_ANSI_8],
    [kVK_ANSI_Q, kVK_ANSI_W, kVK_ANSI_E, kVK_ANSI_R, kVK_ANSI_T, kVK_ANSI_Y, kVK_ANSI_U, kVK_ANSI_I],
  ]
  var columns = 4

  func hotKeyEvent(id: UInt32, pressed: Bool) {
    if id == 1 { if pressed { toggle() }; return }
    let slot = Int(id) - 100, row = slot / 8, col = slot % 8
    guard col < columns else { return }
    let i = row * columns + col
    guard i < keys.count else { return }
    keys[i].layer?.transform = pressed ? CATransform3DMakeScale(0.93, 0.93, 1) : CATransform3DIdentity
    host.send(["t": pressed ? "down" : "up", "i": i])
  }

  func registerHotKey() {
    var specs = [EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed)),
                 EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyReleased))]
    InstallEventHandler(GetApplicationEventTarget(), { _, event, ctx in
      var hk = EventHotKeyID()
      GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &hk)
      let pressed = GetEventKind(event) == UInt32(kEventHotKeyPressed)
      let me = Unmanaged<AppDelegate>.fromOpaque(ctx!).takeUnretainedValue()
      DispatchQueue.main.async { me.hotKeyEvent(id: hk.id, pressed: pressed) }
      return noErr
    }, 2, &specs, Unmanaged.passUnretained(self).toOpaque(), nil)
    let sig = OSType(0x5344_4B31)  // "SDK1"
    var ref: EventHotKeyRef?
    RegisterEventHotKey(UInt32(kVK_Space), UInt32(cmdKey | optionKey | controlKey), EventHotKeyID(signature: sig, id: 1), GetApplicationEventTarget(), 0, &ref)
    for (r, row) in AppDelegate.rowKeys.enumerated() {
      for (c, key) in row.enumerated() {
        RegisterEventHotKey(UInt32(key), UInt32(controlKey | optionKey), EventHotKeyID(signature: sig, id: UInt32(100 + r * 8 + c)), GetApplicationEventTarget(), 0, &ref)
      }
    }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)  // lives in the menu bar + floating panel, never steals focus
app.run()
