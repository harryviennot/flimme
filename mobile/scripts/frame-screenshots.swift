// Frames the store screenshots (docs/store/screenshots.md): a caption above the captured screen,
// on the app's background, in the app's display font. Writes, for each language and scene:
//   <out>/screenshots/app-store/<lang>/NN-<scene>.png   1206 x 2622, the whole capture scaled
//   <out>/screenshots/google-play/<lang>/NN-<scene>.png 1080 x 1920, status bar and home
//                                                      indicator cropped first
// No alpha channel (Apple refuses it). Run by scripts/store-shots.sh, or by hand:
//   swift scripts/frame-screenshots.swift <raw dir with fr/ and en/> <docs/store dir>
import AppKit

let args = CommandLine.arguments
guard args.count == 3 else { fatalError("usage: frame-screenshots.swift <raw dir> <docs/store dir>") }
let raw = args[1]
let out = args[2]
let here = URL(fileURLWithPath: #filePath).deletingLastPathComponent().path

// The captions come from the table in screenshots.md: | 01 | swipe | Français | English |
func captions() -> [(number: String, scene: String, fr: String, en: String)] {
  let text = try! String(contentsOfFile: "\(out)/screenshots.md", encoding: .utf8)
  var rows: [(String, String, String, String)] = []
  for line in text.split(separator: "\n") where line.hasPrefix("| 0") {
    let cells = line.split(separator: "|", omittingEmptySubsequences: false).map {
      $0.trimmingCharacters(in: .whitespaces)
    }
    if cells.count >= 6 { rows.append((cells[1], cells[2], cells[3], cells[4])) }
  }
  return rows
}

let font = URL(fileURLWithPath: "\(here)/../assets/fonts/Staatliches-Regular.ttf")
CTFontManagerRegisterFontsForURL(font as CFURL, .process, nil)

let background = NSColor(srgbRed: 0x0f / 255, green: 0x10 / 255, blue: 0x14 / 255, alpha: 1)
let marquee = NSColor(srgbRed: 0xf6 / 255, green: 0xc7 / 255, blue: 0, alpha: 1)
let primary = NSColor(srgbRed: 0xec / 255, green: 0xed / 255, blue: 0xf1 / 255, alpha: 1)

func rep(_ w: Int, _ h: Int) -> NSBitmapImageRep {
  let r = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  r.size = NSSize(width: w, height: h)
  return r
}

/// One framed image. `crop` is how many pixels of the capture to drop at the top and the bottom.
func frame(
  capture: NSImage, caption: String, width: Int, height: Int, screenWidth: CGFloat, cropTop: CGFloat,
  cropBottom: CGFloat, bottomMargin: CGFloat, fontSize: CGFloat, captionTop: CGFloat, to path: String
) {
  let canvas = rep(width, height)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: canvas)
  NSGraphicsContext.current?.imageInterpolation = .high
  background.setFill()
  NSRect(x: 0, y: 0, width: width, height: height).fill()

  // The screen, scaled to `screenWidth`, bottom aligned.
  let source = NSRect(
    x: 0, y: cropBottom, width: capture.size.width,
    height: capture.size.height - cropTop - cropBottom)
  let scale = screenWidth / source.width
  let target = NSRect(
    x: (CGFloat(width) - screenWidth) / 2, y: bottomMargin, width: screenWidth,
    height: source.height * scale)
  // The phone's corner (about 165 px on the capture), or a small one once the corners are cropped.
  let radius: CGFloat = cropTop == 0 ? 165 * scale : 40
  NSGraphicsContext.saveGraphicsState()
  NSBezierPath(roundedRect: target, xRadius: radius, yRadius: radius).addClip()
  capture.draw(in: target, from: source, operation: .copy, fraction: 1)
  NSGraphicsContext.restoreGraphicsState()
  NSColor(white: 1, alpha: 0.12).setStroke()
  let border = NSBezierPath(roundedRect: target, xRadius: radius, yRadius: radius)
  border.lineWidth = 3
  border.stroke()

  // The caption, centred, in the space above the screen.
  let style = NSMutableParagraphStyle()
  style.alignment = .center
  style.lineSpacing = fontSize * 0.04
  let attributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "Staatliches-Regular", size: fontSize) ?? NSFont.boldSystemFont(ofSize: fontSize),
    .foregroundColor: primary, .paragraphStyle: style, .kern: fontSize * 0.01,
  ]
  let area = NSRect(
    x: CGFloat(width) * 0.08, y: target.maxY + 20, width: CGFloat(width) * 0.84,
    height: CGFloat(height) - target.maxY - captionTop - 20)
  let string = NSAttributedString(string: caption.uppercased(), attributes: attributes)
  let box = string.boundingRect(
    with: area.size, options: [.usesLineFragmentOrigin, .usesFontLeading])
  let drawn = NSRect(
    x: area.minX, y: area.minY + (area.height - box.height) / 2, width: area.width, height: box.height)
  string.draw(with: drawn, options: [.usesLineFragmentOrigin, .usesFontLeading])
  NSGraphicsContext.restoreGraphicsState()

  // Drop the alpha channel: Apple refuses images that have one.
  let flat = rep(width, height)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: flat)
  background.setFill()
  NSRect(x: 0, y: 0, width: width, height: height).fill()
  canvas.draw(in: NSRect(x: 0, y: 0, width: width, height: height))
  NSGraphicsContext.restoreGraphicsState()
  let cg = flat.cgImage!
  let opaque = CGContext(
    data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  opaque.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
  let result = NSBitmapImageRep(cgImage: opaque.makeImage()!)
  let png = result.representation(using: .png, properties: [:])!
  try! FileManager.default.createDirectory(
    atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
  try! png.write(to: URL(fileURLWithPath: path))
}

for row in captions() {
  for lang in ["fr", "en"] {
    let file = "\(raw)/\(lang)/\(row.number)-\(row.scene).png"
    guard let capture = NSImage(contentsOfFile: file) else { fatalError("missing \(file)") }
    let text = lang == "fr" ? row.fr : row.en
    let name = "\(row.number)-\(row.scene).png"
    // App Store: the whole capture, scaled, under the caption.
    frame(
      capture: capture, caption: text, width: 1206, height: 2622, screenWidth: 880, cropTop: 0,
      cropBottom: 0, bottomMargin: 110, fontSize: 112, captionTop: 110,
      to: "\(out)/screenshots/app-store/\(lang)/\(name)")
    // Google Play: the status bar (top 175 px) and the home indicator (bottom 100 px) cropped.
    frame(
      capture: capture, caption: text, width: 1080, height: 1920, screenWidth: 700, cropTop: 175,
      cropBottom: 100, bottomMargin: 70, fontSize: 88, captionTop: 80,
      to: "\(out)/screenshots/google-play/\(lang)/\(name)")
  }
}
print("Framed into \(out)/screenshots")
