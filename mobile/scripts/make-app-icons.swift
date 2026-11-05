// Flimme's app icons, made from Harry's two source images in assets/images/:
//   flimme-icon-1024.png  the flat 1024 icon (the same artwork as assets/flimme.icon, the iOS icon)
//   flimme-mascot.png     the mascot alone, on a transparent background
// Writes, next to them: icon.png (production, flat), icon-dev.png and icon-preview.png (a coloured
// band with the variant's name, so the builds can't be confused), favicon.png, the Android
// adaptive layers (the mascot in the centre 66%, plain and monochrome, plus dev and preview with
// the band) and the invite page's icons in public/. The Android background is a colour in
// app.config.ts (ANDROID_BACKGROUND there matches the icon's corner colour).
// Run from mobile/: swift scripts/make-app-icons.swift
import AppKit

let images = "assets/images"

func load(_ path: String) -> NSImage {
  guard let img = NSImage(contentsOfFile: path) else { fatalError("missing \(path)") }
  return img
}

func canvas(_ side: Int, _ draw: (CGFloat) -> Void) -> NSBitmapImageRep {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: side, pixelsHigh: side, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  rep.size = NSSize(width: side, height: side)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.imageInterpolation = .high
  draw(CGFloat(side))
  NSGraphicsContext.restoreGraphicsState()
  return rep
}

func save(_ rep: NSBitmapImageRep, _ path: String) {
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

func band(_ side: CGFloat, label: String, color: NSColor, y: Double, h: Double, inset: Double) {
  let rect = NSRect(x: side * inset, y: side * y, width: side * (1 - 2 * inset), height: side * h)
  color.setFill()
  NSBezierPath(roundedRect: rect, xRadius: rect.height / 4, yRadius: rect.height / 4).fill()
  let fontSize = rect.height * 0.6
  let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont.systemFont(ofSize: fontSize, weight: .black), .foregroundColor: NSColor.white, .kern: fontSize * 0.08,
  ]
  let text = NSAttributedString(string: label, attributes: attrs)
  let ts = text.size()
  text.draw(at: NSPoint(x: rect.midX - ts.width / 2, y: rect.midY - ts.height / 2))
}

let icon = load("\(images)/flimme-icon-1024.png")
let mascot = load("\(images)/flimme-mascot.png")
let dev = NSColor(srgbRed: 0.93, green: 0.45, blue: 0.05, alpha: 1)
let preview = NSColor(srgbRed: 0.55, green: 0.20, blue: 0.80, alpha: 1)

func flat(_ side: Int, label: String? = nil, color: NSColor = dev, inset: Double = 0.18) -> NSBitmapImageRep {
  canvas(side) { s in
    icon.draw(in: NSRect(x: 0, y: 0, width: s, height: s))
    if let label { band(s, label: label, color: color, y: 0.05, h: 0.2, inset: inset) }
  }
}

// The mascot, fitted into the centre 66% of the layer (Android crops the rest), optionally as a
// white silhouette for themed icons. A band, when there is one, sits under it inside the 66%.
func layer(label: String? = nil, color: NSColor = dev, inset: Double = 0.2, silhouette: Bool = false) -> NSBitmapImageRep {
  canvas(1024) { s in
    let box = s * 0.66
    let bandH = label == nil ? 0 : box * 0.2
    let fit = min(box / mascot.size.width, (box - bandH) / mascot.size.height)
    let w = mascot.size.width * fit, h = mascot.size.height * fit
    let bottom = (s - box) / 2
    let rect = NSRect(x: (s - w) / 2, y: bottom + bandH + (box - bandH - h) / 2, width: w, height: h)
    mascot.draw(in: rect)
    if silhouette {
      NSColor.white.setFill()
      rect.fill(using: .sourceIn)
    }
    if let label { band(s, label: label, color: color, y: bottom / s, h: bandH / s * 0.9, inset: inset) }
  }
}

save(flat(1024), "\(images)/icon.png")
save(flat(1024, label: "DEV", color: dev, inset: 0.18), "\(images)/icon-dev.png")
save(flat(1024, label: "PREVIEW", color: preview, inset: 0.10), "\(images)/icon-preview.png")
save(flat(256), "\(images)/favicon.png")
save(layer(), "\(images)/android-icon-foreground.png")
save(layer(label: "DEV", color: dev, inset: 0.24), "\(images)/android-icon-foreground-dev.png")
save(layer(label: "PREVIEW", color: preview, inset: 0.20), "\(images)/android-icon-foreground-preview.png")
save(layer(silhouette: true), "\(images)/android-icon-monochrome.png")
save(flat(180), "public/apple-touch-icon.png")
save(flat(192), "public/icon-192.png")
save(flat(512), "public/icon-512.png")
