import SwiftUI
import HelperCore

struct CompactResultView: View {
    @ObservedObject var model: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Learning Helper").font(.headline)
                Spacer()
                Button { model.showSettings?() } label: { Image(systemName: "gearshape") }
                    .buttonStyle(.plain).help("Einstellungen")
            }
            if model.busy {
                Spacer()
                VStack(spacing: 12) {
                    ProgressView()
                    Text(model.phase).font(.callout).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity)
                Spacer()
                Button("Abbrechen") { model.cancel() }.frame(maxWidth: .infinity)
            } else if let error = model.error {
                ScrollView {
                    Label(error, systemImage: "exclamationmark.triangle").font(.callout)
                        .foregroundStyle(.orange).frame(maxWidth: .infinity, alignment: .leading)
                }
                HStack {
                    Button("Erneut versuchen") { if model.canRetry { model.retry() } else { model.analyze() } }
                    Spacer()
                    Button("Einstellungen") { model.showSettings?() }
                }
            } else if let answer = model.answer {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(answer.orderedQuestions) { question in
                            Text(question.compactLine).font(.system(size: 18, weight: .semibold)).monospacedDigit()
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 5)
                }
                HStack {
                    Button("Mehr Infos") { model.showDetails?() }.buttonStyle(.borderedProminent)
                    Spacer()
                    Button("Verwerfen") { model.discard() }
                }
            } else {
                Text(model.testReport.isEmpty ? model.phase : "Test abgeschlossen")
                    .font(.callout).foregroundStyle(.secondary)
                Spacer()
                if model.capture != nil || !model.testReport.isEmpty {
                    Button("Mehr Infos") { model.showDetails?() }
                } else {
                    Text("Browser fokussieren und auf das Symbol klicken.").font(.callout)
                }
            }
        }.padding(18).frame(width: 340, height: 270)
    }
}
