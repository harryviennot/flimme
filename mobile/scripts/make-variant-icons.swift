// Placeholder icons for the development and preview builds, until the designer exports the real
// ones from the Figma (roadmap M11.2). Draws a coloured band with the variant's name on copies of
// the production icon. Run from mobile/: swift scripts/make-variant-icons.swift
import AppKit

let images = "assets/images"

func band(_ base: String, _ out: String, label: String, color: NSColor, bandY: Double, bandH: Double, inset: Double) {
  guard let src = NSImage(contentsOfFile: "\(images)/\(base)") else { fatalError("missing \(base)") }
  let size = src.size
  let w = Int(size.width), h = Int(size.height)
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = size
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  src.draw(in: NSRect(origin: .zero, size: size))
  let rect = NSRect(x: size.width * inset, y: size.height * bandY, width: size.width * (1 - 2 * inset), height: size.height * bandH)
  color.setFill()
  NSBezierPath(roundedRect: rect, xRadius: rect.height / 4, yRadius: rect.height / 4).fill()
  let fontSize = rect.height * 0.6
  let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: fontSize, weight: .black), .foregroundColor: NSColor.white, .kern: fontSize * 0.08,
  ]
  let text = NSAttributedString(string: label, attributes: attrs)
  let ts = text.size()
  text.draw(at: NSPoint(x: rect.midX - ts.width / 2, y: rect.midY - ts.height / 2))
  NSGraphicsContext.restoreGraphicsState()
  let data = rep.representation(using: .png, properties: [:])!
  try! data.write(to: URL(fileURLWithPath: "\(images)/\(out)"))
}

let dev = NSColor(srgbRed: 0.93, green: 0.45, blue: 0.05, alpha: 1)
let preview = NSColor(srgbRed: 0.55, green: 0.20, blue: 0.80, alpha: 1)

// iOS: full-bleed square, band near the bottom. Android: the foreground sits in the centre 66%.
band("icon.png", "icon-dev.png", label: "DEV", color: dev, bandY: 0.08, bandH: 0.22, inset: 0.18)
band("icon.png", "icon-preview.png", label: "PREVIEW", color: preview, bandY: 0.08, bandH: 0.22, inset: 0.10)
band("android-icon-foreground.png", "android-icon-foreground-dev.png", label: "DEV", color: dev, bandY: 0.20, bandH: 0.16, inset: 0.24)
band("android-icon-foreground.png", "android-icon-foreground-preview.png", label: "PREVIEW", color: preview, bandY: 0.20, bandH: 0.16, inset: 0.20)
