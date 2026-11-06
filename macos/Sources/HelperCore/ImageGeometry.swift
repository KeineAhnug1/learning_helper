import Foundation
import CoreGraphics

public enum ImageGeometry {
    /// Selection is relative to the top left of the captured display, in points.
    public static func cropRect(selection: CGRect, viewSize: CGSize, pixelSize: CGSize) throws -> CGRect {
        guard [selection.minX, selection.minY, selection.width, selection.height,
               viewSize.width, viewSize.height, pixelSize.width, pixelSize.height].allSatisfy(\.isFinite),
              viewSize.width > 0, viewSize.height > 0, pixelSize.width > 0, pixelSize.height > 0 else {
            throw HelperError("Ungültiger Bildausschnitt.")
        }
        let clipped = selection.standardized.intersection(CGRect(origin: .zero, size: viewSize))
        guard !clipped.isNull, clipped.width >= 8, clipped.height >= 8 else {
            throw HelperError("Bitte einen größeren Bereich mit der vollständigen Frage auswählen.")
        }
        let x = pixelSize.width / viewSize.width, y = pixelSize.height / viewSize.height
        return CGRect(x: clipped.minX * x, y: clipped.minY * y, width: clipped.width * x, height: clipped.height * y)
            .integral.intersection(CGRect(origin: .zero, size: pixelSize))
    }
}
