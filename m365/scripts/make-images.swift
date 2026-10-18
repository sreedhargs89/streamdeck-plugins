// Plugin/action icons. Run: swift scripts/make-images.swift
import AppKit
let root = URL(fileURLWithPath: "com.sree.m365.sdPlugin/imgs")
func png(_ px: Int, _ name: String, _ draw: (CGFloat) -> Void) {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  draw(CGFloat(px)); NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: root.appendingPathComponent(name))
}
func centered(_ s: String, _ size: CGFloat, _ box: CGFloat, color: NSColor = .white) {
  let a = NSAttributedString(string: s, attributes: [.font: NSFont.systemFont(ofSize: size, weight: .heavy), .foregroundColor: color])
  let sz = a.size(); a.draw(at: NSPoint(x: (box - sz.width) / 2, y: (box - sz.height) / 2))
}
let c1 = NSColor(red: 0.04, green: 0.31, blue: 0.54, alpha: 1), c2 = NSColor(red: 0.12, green: 0.53, blue: 0.9, alpha: 1)
for (n, x) in [("", 1), ("@2x", 2)] {
  png(144 * x, "plugin\(n).png") { s in NSGradient(starting: c1, ending: c2)!.draw(in: NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: s, height: s), xRadius: s * 0.18, yRadius: s * 0.18), angle: -60); centered("📅", s * 0.55, s) }
  png(72 * x, "next\(n).png") { s in NSGradient(starting: c1, ending: c2)!.draw(in: NSRect(x: 0, y: 0, width: s, height: s), angle: -60); centered("📅", s * 0.55, s) }
  png(28 * x, "category\(n).png") { s in centered("◷", s * 0.8, s) }
}
