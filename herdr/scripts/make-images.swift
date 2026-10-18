// Renders emoji PNGs for tiles and the plugin/action icons. Run: swift scripts/make-images.swift
import AppKit
let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "com.sree.herdr.sdPlugin/imgs")
try? FileManager.default.createDirectory(at: root.appendingPathComponent("emoji"), withIntermediateDirectories: true)

func png(_ px: Int, _ path: URL, _ draw: (CGFloat) -> Void) {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  draw(CGFloat(px))
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: path)
}
func centered(_ s: String, _ size: CGFloat, _ box: CGFloat, y: CGFloat? = nil, color: NSColor = .white, weight: NSFont.Weight = .regular) {
  let a = NSAttributedString(string: s, attributes: [.font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color])
  let sz = a.size()
  a.draw(at: NSPoint(x: (box - sz.width) / 2, y: y ?? (box - sz.height) / 2))
}

let emoji = ["briefcase": "💼", "gear": "⚙️", "globe": "🌐", "ticket": "🎫", "tools": "🛠️", "folder": "📁", "robot": "🤖",
             "chart": "📊", "cloud": "☁️", "lock": "🔒", "shield": "🛡️", "stocks": "📈", "lab": "🧪", "controls": "🎛️",
             "speech": "💬", "compass": "🧭"]
for (name, e) in emoji {
  png(112, root.appendingPathComponent("emoji/\(name).png")) { s in centered(e, s * 0.78, s) }
}

func icon(_ name: String, _ c1: NSColor, _ c2: NSColor, _ glyph: String, _ px: Int, rounded: Bool = true) {
  png(px, root.appendingPathComponent(name)) { s in
    let r = NSRect(x: 0, y: 0, width: s, height: s)
    let p = rounded ? NSBezierPath(roundedRect: r, xRadius: s * 0.18, yRadius: s * 0.18) : NSBezierPath(rect: r)
    NSGradient(starting: c1, ending: c2)!.draw(in: p, angle: -60)
    centered(glyph, s * 0.46, s, weight: .heavy)
  }
}
let teal1 = NSColor(red: 0, green: 0.30, blue: 0.25, alpha: 1), teal2 = NSColor(red: 0, green: 0.54, blue: 0.48, alpha: 1)
let blue1 = NSColor(red: 0.04, green: 0.31, blue: 0.54, alpha: 1), blue2 = NSColor(red: 0.12, green: 0.53, blue: 0.9, alpha: 1)
let org1 = NSColor(red: 0.9, green: 0.32, blue: 0, alpha: 1), org2 = NSColor(red: 1, green: 0.6, blue: 0, alpha: 1)
let gry1 = NSColor(red: 0.15, green: 0.2, blue: 0.22, alpha: 1), gry2 = NSColor(red: 0.33, green: 0.43, blue: 0.48, alpha: 1)
for (n, px) in [("", 1), ("@2x", 2)] {
  icon("plugin\(n).png", teal1, teal2, ">_", 144 * px)
  icon("slot\(n).png", blue1, blue2, ">_", 72 * px, rounded: false)
  icon("needs\(n).png", org1, org2, "⚡", 72 * px, rounded: false)
  icon("more\(n).png", gry1, gry2, "▶", 72 * px, rounded: false)
  // category icon: white glyph on transparent, as Elgato recommends
  png(28 * px, root.appendingPathComponent("category\(n).png")) { s in centered(">_", s * 0.6, s, weight: .heavy) }
}
// folder key for the profile: teal ">_" with "herdr" caption
png(144, root.appendingPathComponent("folder-key.png")) { s in
  NSGradient(starting: teal1, ending: teal2)!.draw(in: NSRect(x: 0, y: 0, width: s, height: s), angle: -60)
  centered(">_", s * 0.40, s, y: s * 0.36, weight: .heavy)
  centered("herdr", s * 0.19, s, y: s * 0.10, weight: .bold)
}
print("images written to \(root.path)")
