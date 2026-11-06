import AppKit
import HelperCore

enum FixtureRenderer {
    static func render(_ fixture: FixtureSpec) throws -> CGImage {
        let width = 1200, height = 1000
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw HelperError("Das Testbild konnte nicht erzeugt werden.")
        }
        context.setFillColor((fixture.dark ? NSColor(white: 0.1, alpha: 1) : NSColor(white: 0.97, alpha: 1)).cgColor)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
        let color = fixture.dark ? NSColor.white : NSColor.black
        ("Learning Helper · Künstliche Testfrage" as NSString).draw(at: CGPoint(x: 60, y: 920), withAttributes: [
            .font: NSFont.systemFont(ofSize: 20, weight: .semibold), .foregroundColor: color
        ])
        let paragraph = NSMutableParagraphStyle(); paragraph.lineSpacing = 12
        (fixture.body as NSString).draw(in: CGRect(x: 60, y: 60, width: 1080, height: 800), withAttributes: [
            .font: NSFont.systemFont(ofSize: CGFloat(fixture.fontSize)), .foregroundColor: color, .paragraphStyle: paragraph
        ])
        NSGraphicsContext.restoreGraphicsState()
        guard let image = context.makeImage() else { throw HelperError("Testbild ist leer.") }
        return image
    }
}
