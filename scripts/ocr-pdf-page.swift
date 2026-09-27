// Local-only OCR helper for scanned PDF pages. Input: PDF path and 1-based page numbers.
// Output: one JSON line per page. The source never leaves this computer.
import AppKit
import Foundation
import PDFKit
import Vision

struct PageResult: Encodable {
    let page: Int
    let text: String
    let error: String?
}

func emit(_ result: PageResult) {
    let encoder = JSONEncoder()
    if let payload = try? encoder.encode(result), let line = String(data: payload, encoding: .utf8) {
        print(line)
        fflush(stdout)
    }
}

guard CommandLine.arguments.count >= 3,
      let document = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])) else {
    fputs("usage: ocr-pdf-page <pdf> <page-number>...\n", stderr)
    exit(2)
}

for pageArgument in CommandLine.arguments.dropFirst(2) {
    guard let pageNumber = Int(pageArgument), pageNumber > 0,
          let page = document.page(at: pageNumber - 1) else {
        emit(PageResult(page: Int(pageArgument) ?? 0, text: "", error: "invalid_page"))
        continue
    }
    let bounds = page.bounds(for: .mediaBox)
    let longest = max(bounds.width, bounds.height)
    guard longest > 0 else {
        emit(PageResult(page: pageNumber, text: "", error: "invalid_page_size"))
        continue
    }
    let scale = min(2.4, 1900.0 / longest)
    let image = page.thumbnail(of: CGSize(width: max(1, bounds.width * scale),
                                         height: max(1, bounds.height * scale)), for: .mediaBox)
    var proposed = CGRect(origin: .zero, size: image.size)
    guard let cgImage = image.cgImage(forProposedRect: &proposed, context: nil, hints: nil) else {
        emit(PageResult(page: pageNumber, text: "", error: "render_failed"))
        continue
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    do {
        try VNImageRequestHandler(cgImage: cgImage).perform([request])
        let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
        emit(PageResult(page: pageNumber, text: text, error: nil))
    } catch {
        fputs("Vision OCR failed: \(error)\n", stderr)
        emit(PageResult(page: pageNumber, text: "", error: "vision_failed"))
    }
}
