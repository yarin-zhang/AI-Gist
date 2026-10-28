import SwiftUI
import NativeUIPlugin

/// 提示词页底栏上方的附件栏：左边「AI 生成」或「新建提示词」，右边一个圆按钮。
///
/// 网页源元素和读取器在 src/renderer/lib/mobile/ios-native-ui.ts（扩展名
/// ai-gist.prompt-accessory），这里只负责画：系统底栏是单独的 UITabBar，没有
/// tabViewBottomAccessory 可用，所以在网页附件栏的位置画一个同样的 Liquid Glass
/// 胶囊。文字、图标和颜色都来自网页按钮，点击后由网页按钮自己的处理函数响应。
enum PromptAccessory {
    static let name = "ai-gist.prompt-accessory"

    @MainActor static func register() throws {
        try NativeUI.register(name) { (props: PromptAccessoryProps, actions: NativeUIActions) in
            if #available(iOS 26.0, *) {
                PromptAccessoryView(props: props, actions: actions)
            }
        }
    }
}

struct PromptAccessoryProps: Decodable {
    struct Action: Decodable {
        let label: String
        let accessibilityLabel: String
        let icon: NativeUIImage
        let color: String
    }

    let primary: Action
    let secondary: Action
}

@available(iOS 26.0, *)
private struct PromptAccessoryView: View {
    let props: PromptAccessoryProps
    let actions: NativeUIActions

    var body: some View {
        // 尺寸和间距对齐设计稿 C-MTabBar 的 .m-acc（高 48，左 18 右 4）
        HStack(spacing: 0) {
            Button { activate("primary") } label: {
                HStack(spacing: 8) {
                    icon(props.primary.icon, size: 20)
                    Text(props.primary.label)
                        .font(.system(size: 15, weight: .semibold))
                        .lineLimit(1)
                }
                .padding(.leading, 18)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .foregroundStyle(color(props.primary.color))
            .accessibilityLabel(props.primary.accessibilityLabel)
            .disabled(!actions.isAvailable("primary"))

            Rectangle()
                .fill(.separator)
                .frame(width: 1, height: 22)
                .padding(.horizontal, 4)
                .accessibilityHidden(true)

            Button { activate("secondary") } label: {
                icon(props.secondary.icon, size: 24)
                    .frame(width: 40, height: 40)
                    .contentShape(Circle())
            }
            .foregroundStyle(color(props.secondary.color))
            .accessibilityLabel(props.secondary.accessibilityLabel)
            .disabled(!actions.isAvailable("secondary"))
            .padding(.trailing, 4)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .glassEffect(.regular.interactive(), in: .capsule)
    }

    private func activate(_ name: String) {
        // 网页按钮被移除或禁用时会失败，下一次快照会把按钮同步成不可用
        Task { @MainActor in try? await actions.activate(name) }
    }

    @ViewBuilder
    private func icon(_ image: NativeUIImage, size: CGFloat) -> some View {
        if let uiImage = NativeUIRendering.image(image) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
        }
    }

    private func color(_ css: String) -> Color {
        Color(uiColor: NativeUIRendering.color(css))
    }
}
