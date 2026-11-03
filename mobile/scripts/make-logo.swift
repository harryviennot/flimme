// The Flimme logo: the marquee sign from the Figma's first-release splash (node 99:3548), with
// "FLIMME" in Staatliches turned into outlines. Writes assets/logos/flimme.svg (the splash's
// hand-off view, through `logos.flimme` after `pnpm tokens`) and assets/images/splash-icon.png (the
// native splash) from the same shapes, so the switch between them is invisible. Colours come from
// src/theme/tokens.json. Spec: docs/design/screens/splash.md#the-logo.
// Run from mobile/: swift scripts/make-logo.swift
import AppKit
import CoreText

// --- tokens ----------------------------------------------------------------------------------

let tokens = try! JSONSerialization.jsonObject(
  with: Data(contentsOf: URL(fileURLWithPath: "src/theme/tokens.json"))) as! [String: Any]

func token(_ path: String) -> String {
  var node: Any = tokens
  for key in path.split(separator: ".") { node = (node as! [String: Any])[String(key)]! }
  return ((node as! [String: Any])["$value"] as! String).lowercased()
}

struct RGBA { let hex: String; let r, g, b, a: Double }

func color(_ path: String) -> RGBA {
  let h = String(token(path).dropFirst())
  func c(_ i: Int) -> Double {
    let s = h.index(h.startIndex, offsetBy: i)
    return Double(Int(h[s..<h.index(s, offsetBy: 2)], radix: 16)!) / 255
  }
  return RGBA(hex: "#" + h.prefix(6), r: c(0), g: c(2), b: c(4), a: h.count == 8 ? c(6) : 1)
}

let frameStroke = color("color.marquee.default")
let wordmark = color("color.marquee.bright")
let bulbOn = color("color.marquee.bright")
let bulbOff = color("color.marquee.strong")
let fill = color("color.bg.sunken")
let glow = color("color.glow.marquee")

// --- geometry (points, from the Figma) -------------------------------------------------------

let glowSize = 24.0  // the glow-marquee blur, kept around the sign so nothing is clipped
let sign = CGRect(x: glowSize, y: glowSize, width: 306, height: 140)
let canvas = CGSize(width: sign.width + 2 * glowSize, height: sign.height + 2 * glowSize)
let radius = 16.0  // radius.lg
let border = 3.0  // drawn inside the sign's edge
let bulbSize = 9.0, bulbPitch = 21.0, bulbCount = 12
let bulbRows = [sign.minY + 25 + bulbSize / 2, sign.minY + 106 + bulbSize / 2]
let bulbStartX = sign.minX + 33 + bulbSize / 2
let fontSize = 92.0, tracking = 0.92

// --- the wordmark, as outlines in canvas coordinates (y down) ---------------------------------

let fontURL = URL(fileURLWithPath: "assets/fonts/Staatliches-Regular.ttf")
let descriptor = (CTFontManagerCreateFontDescriptorsFromURL(fontURL as CFURL) as! [CTFontDescriptor])[0]
let font = CTFontCreateWithFontDescriptor(descriptor, fontSize, nil)
let line = CTLineCreateWithAttributedString(
  NSAttributedString(
    string: "FLIMME",
    attributes: [kCTFontAttributeName as NSAttributedString.Key: font,
                 kCTKernAttributeName as NSAttributedString.Key: tracking]))
let glyphsUp = CGMutablePath()
for run in CTLineGetGlyphRuns(line) as! [CTRun] {
  let count = CTRunGetGlyphCount(run)
  var glyphs = [CGGlyph](repeating: 0, count: count)
  var positions = [CGPoint](repeating: .zero, count: count)
  CTRunGetGlyphs(run, CFRange(location: 0, length: count), &glyphs)
  CTRunGetPositions(run, CFRange(location: 0, length: count), &positions)
  for i in 0..<count {
    if let path = CTFontCreatePathForGlyph(font, glyphs[i], nil) {
      glyphsUp.addPath(path, transform: CGAffineTransform(translationX: positions[i].x, y: positions[i].y))
    }
  }
}
// Centre the letters' outlines in the sign, which is also where the Figma's text box sits.
let ink = glyphsUp.boundingBoxOfPath
var flip = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: sign.midX - ink.midX, ty: sign.midY + ink.midY)
let letters = glyphsUp.copy(using: &flip)!

func svgPath(_ path: CGPath) -> String {
  func n(_ v: CGFloat) -> String {
    let s = String(format: "%.2f", Double(v))
    return s.replacingOccurrences(of: #"\.?0+$"#, with: "", options: .regularExpression)
  }
  var d = ""
  path.applyWithBlock { el in
    let p = el.pointee.points
    switch el.pointee.type {
    case .moveToPoint: d += "M\(n(p[0].x)) \(n(p[0].y))"
    case .addLineToPoint: d += "L\(n(p[0].x)) \(n(p[0].y))"
    case .addQuadCurveToPoint: d += "Q\(n(p[0].x)) \(n(p[0].y)) \(n(p[1].x)) \(n(p[1].y))"
    case .addCurveToPoint:
      d += "C\(n(p[0].x)) \(n(p[0].y)) \(n(p[1].x)) \(n(p[1].y)) \(n(p[2].x)) \(n(p[2].y))"
    case .closeSubpath: d += "Z"
    @unknown default: break
    }
  }
  return d
}

// --- the glow, without filters -----------------------------------------------------------------
// glow-marquee is a 24-point blur (a Gaussian with sigma 12). SVG filters don't render the same
// everywhere, so the glow is 24 stacked rounded rectangles, one point apart, whose opacities add up
// to the blurred edge's falloff.

let sigma = glowSize / 2
func blurred(_ d: Double) -> Double { glow.a * 0.5 * erfc(d / (sigma * 2.0.squareRoot())) }
// Shifted to reach zero at the canvas edge, so the image has no visible border.
func falloff(_ d: Double) -> Double { blurred(d) - blurred(glowSize) }
let steps = Int(glowSize)
var layerOpacity = [Double](repeating: 0, count: steps + 2)
var outer = 0.0  // the cover of the layers further out
for k in stride(from: steps, through: 1, by: -1) {
  let target = falloff(Double(k) - 0.5)
  layerOpacity[k] = 1 - (1 - target) / (1 - outer)
  outer = target
}

// --- shapes, drawn the same way into the SVG and the PNG ---------------------------------------

enum Shape {
  case roundedRect(CGRect, CGFloat, fill: RGBA?, fillOpacity: Double, stroke: RGBA?, strokeWidth: CGFloat)
  case circle(CGPoint, CGFloat, RGBA)
  case path(CGPath, RGBA)
}

var shapes: [Shape] = []
for k in stride(from: steps, through: 1, by: -1) {
  let d = CGFloat(k)
  shapes.append(.roundedRect(sign.insetBy(dx: -d, dy: -d), radius + d, fill: glow,
                             fillOpacity: layerOpacity[k], stroke: nil, strokeWidth: 0))
}
let inset = border / 2
shapes.append(.roundedRect(sign.insetBy(dx: inset, dy: inset), radius - inset, fill: fill,
                           fillOpacity: 1, stroke: frameStroke, strokeWidth: border))
for y in bulbRows {
  for i in 0..<bulbCount {
    shapes.append(.circle(CGPoint(x: bulbStartX + Double(i) * bulbPitch, y: y), bulbSize / 2,
                          i % 2 == 0 ? bulbOn : bulbOff))
  }
}
shapes.append(.path(letters, wordmark))

// --- SVG ---------------------------------------------------------------------------------------

func f(_ v: CGFloat) -> String {
  String(format: "%.3f", Double(v)).replacingOccurrences(of: #"\.?0+$"#, with: "", options: .regularExpression)
}
var svg = [
  #"<svg width="\#(f(canvas.width))" height="\#(f(canvas.height))" viewBox="0 0 \#(f(canvas.width)) \#(f(canvas.height))" fill="none" xmlns="http://www.w3.org/2000/svg">"#,
]
for shape in shapes {
  switch shape {
  case let .roundedRect(r, rad, fillColor, opacity, stroke, width):
    var attrs = #"x="\#(f(r.minX))" y="\#(f(r.minY))" width="\#(f(r.width))" height="\#(f(r.height))" rx="\#(f(rad))""#
    attrs += fillColor.map { #" fill="\#($0.hex)""# } ?? #" fill="none""#
    if opacity < 1 { attrs += #" fill-opacity="\#(String(format: "%.4f", opacity))""# }
    if let s = stroke { attrs += #" stroke="\#(s.hex)" stroke-width="\#(f(width))""# }
    svg.append("<rect \(attrs)/>")
  case let .circle(c, r, col):
    svg.append(#"<circle cx="\#(f(c.x))" cy="\#(f(c.y))" r="\#(f(r))" fill="\#(col.hex)"/>"#)
  case let .path(p, col):
    svg.append(#"<path d="\#(svgPath(p))" fill="\#(col.hex)"/>"#)
  }
}
svg.append("</svg>")
try! (svg.joined(separator: "\n") + "\n").write(toFile: "assets/logos/flimme.svg", atomically: true, encoding: .utf8)

// --- PNG at 4x (Android's xxxhdpi; iOS scales it down) -----------------------------------------

let scale = 4.0
let w = Int(canvas.width * scale), h = Int(canvas.height * scale)
let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.translateBy(x: 0, y: CGFloat(h))
ctx.scaleBy(x: scale, y: -scale)  // y down, in points, like the SVG
func cg(_ c: RGBA, _ opacity: Double = 1) -> CGColor {
  CGColor(srgbRed: c.r, green: c.g, blue: c.b, alpha: opacity)
}
for shape in shapes {
  switch shape {
  case let .roundedRect(r, rad, fillColor, opacity, stroke, width):
    let p = CGPath(roundedRect: r, cornerWidth: rad, cornerHeight: rad, transform: nil)
    if let c = fillColor { ctx.addPath(p); ctx.setFillColor(cg(c, opacity)); ctx.fillPath() }
    if let s = stroke { ctx.addPath(p); ctx.setStrokeColor(cg(s)); ctx.setLineWidth(width); ctx.strokePath() }
  case let .circle(c, r, col):
    ctx.setFillColor(cg(col))
    ctx.fillEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r))
  case let .path(p, col):
    ctx.addPath(p); ctx.setFillColor(cg(col)); ctx.fillPath()
  }
}
let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "assets/images/splash-icon.png"))
print("wrote assets/logos/flimme.svg and assets/images/splash-icon.png (\(w) by \(h))")
