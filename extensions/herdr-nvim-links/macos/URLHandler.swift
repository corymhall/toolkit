import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        guard let helper = Bundle.main.url(forResource: "herdr-nvim-open", withExtension: nil) else {
            showError("The URL handler bundle is missing herdr-nvim-open.")
            application.terminate(nil)
            return
        }

        for url in urls {
            let process = Process()
            let pipe = Pipe()
            process.executableURL = helper
            process.arguments = [url.absoluteString]
            process.standardOutput = pipe
            process.standardError = pipe

            do {
                try process.run()
                let output = pipe.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                if process.terminationStatus != 0 {
                    let message = String(data: output, encoding: .utf8)?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    showError(message?.isEmpty == false ? message! : "The Herdr Neovim helper failed.")
                }
            } catch {
                showError("Could not run the Herdr Neovim helper: \(error.localizedDescription)")
            }
        }

        application.terminate(nil)
    }

    private func showError(_ message: String) {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Could not open file in Herdr Neovim"
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.runModal()
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.run()
