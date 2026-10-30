// "Quiet" key icons: one SF Symbol in white on a calm grey tile, with a small label underneath.
//   swift scripts/quiet-icons.swift spec.json
// spec.json: [{ "out": "/path/key.png", "symbol": "envelope.open", "label": "Read mail", "bg": "#1c1f24" (optional) }]
// Unknown symbols fall back to a label-only tile.
// A "quad" entry draws one key split into four small tiles: { "out": …, "label": "", "quad": [{symbol, label} ×4] }
// (top-left, top-right, bottom-left, bottom-right).
import AppKit

struct Cell: Decodable { let symbol: String?; let label: String }
struct Spec: Decodable { let out: String; let symbol: String?; let label: String; let bg: String?; let quad: [Cell]? }

func color(_ hex: String) -> NSColor {
  var v: UInt64 = 0
  Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
  return NSColor(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
}

let size: CGFloat = 288
let specs = try JSONDecoder().decode([Spec].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))

func drawCell(_ c: Cell, in r: NSRect) {
  NSColor(red: 0.16, green: 0.18, blue: 0.21, alpha: 1).setFill()
  NSBezierPath(roundedRect: r, xRadius: 14, yRadius: 14).fill()
  let para = NSMutableParagraphStyle(); para.alignment = .center
  let t = NSAttributedString(string: c.label, attributes: [.font: NSFont.systemFont(ofSize: 21, weight: .semibold),
                                                           .foregroundColor: NSColor(white: 1, alpha: 0.88), .paragraphStyle: para])
  t.draw(with: NSRect(x: r.minX + 2, y: r.minY + 10, width: r.width - 4, height: 26), options: [.usesLineFragmentOrigin])
  if let name = c.symbol, let sym = NSImage(systemSymbolName: name, accessibilityDescription: nil),
     let img = sym.withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 44, weight: .regular).applying(.init(paletteColors: [.white]))) {
    let fit = min(56 / img.size.width, 50 / img.size.height, 1.4)
    let w = img.size.width * fit, h = img.size.height * fit
    img.draw(in: NSRect(x: r.midX - w / 2, y: r.minY + 44, width: w, height: h))
  }
}

for s in specs {
  if let quad = s.quad {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8, samplesPerPixel: 4,
                               hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    color(s.bg ?? "#1c1f24").setFill(); NSRect(x: 0, y: 0, width: size, height: size).fill()
    let g: CGFloat = 6, cw = (size - g * 3) / 2
    let cells = [NSRect(x: g, y: g * 2 + cw, width: cw, height: cw), NSRect(x: g * 2 + cw, y: g * 2 + cw, width: cw, height: cw),
                 NSRect(x: g, y: g, width: cw, height: cw), NSRect(x: g * 2 + cw, y: g, width: cw, height: cw)]
    for (c, r) in zip(quad, cells) { drawCell(c, in: r) }
    NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: s.out))
    continue
  }
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  color(s.bg ?? "#1c1f24").setFill()
  NSRect(x: 0, y: 0, width: size, height: size).fill()

  let lines = s.label.split(separator: "\n").map(String.init)
  let fontSize: CGFloat = lines.count > 1 ? 30 : 34
  let para = NSMutableParagraphStyle(); para.alignment = .center
  let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: fontSize, weight: .semibold),
                                              .foregroundColor: NSColor(white: 1, alpha: 0.88), .paragraphStyle: para]
  let text = NSAttributedString(string: lines.joined(separator: "\n"), attributes: attrs)
  let textH = text.boundingRect(with: NSSize(width: size - 24, height: size), options: [.usesLineFragmentOrigin]).height

  var symbolDrawn = false
  if let name = s.symbol, let sym = NSImage(systemSymbolName: name, accessibilityDescription: nil) {
    let cfg = NSImage.SymbolConfiguration(pointSize: 92, weight: .regular).applying(.init(paletteColors: [.white]))
    if let img = sym.withSymbolConfiguration(cfg) {
      let fit = min(130 / img.size.width, 110 / img.size.height, 1.6)
      let w = img.size.width * fit, h = img.size.height * fit
      let top = size - 40 - h
      img.draw(in: NSRect(x: (size - w) / 2, y: max(textH + 34, top), width: w, height: h))
      symbolDrawn = true
    }
  }
  let y = symbolDrawn ? 24 : (size - textH) / 2
  text.draw(with: NSRect(x: 12, y: y, width: size - 24, height: textH), options: [.usesLineFragmentOrigin])
  NSGraphicsContext.restoreGraphicsState()
  try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: s.out))
}
print("\(specs.count) icons")
