import Foundation

struct HandlerFailure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct CommandResult {
    let status: Int32
    let output: String
}

struct LinkRequest {
    let sourcePane: String
    let workspace: String
    let tab: String
    let filePath: String
    let cwd: String
    let socket: String?
    let line: Int?
}

func fail(_ message: String) throws -> Never {
    throw HandlerFailure(message: message)
}

func queryValue(_ name: String, in components: URLComponents) -> String? {
    components.queryItems?.first(where: { $0.name == name })?.value
}

func validateIdentifier(_ value: String, name: String) throws {
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:_-")
    if value.isEmpty || value.unicodeScalars.contains(where: { !allowed.contains($0) }) {
        try fail("Invalid \(name) in herdr-nvim URL")
    }
}

func parseRequest(_ raw: String) throws -> LinkRequest {
    guard let components = URLComponents(string: raw),
          components.scheme == "herdr-nvim",
          components.host == "open" else {
        try fail("Expected a herdr-nvim://open URL")
    }
    guard let sourcePane = queryValue("sourcePane", in: components),
          let workspace = queryValue("workspace", in: components),
          let tab = queryValue("tab", in: components),
          let rawFile = queryValue("file", in: components),
          let fileURL = URL(string: rawFile),
          fileURL.isFileURL,
          fileURL.host == nil || fileURL.host == "" || fileURL.host == "localhost" else {
        try fail("The herdr-nvim URL is missing its Herdr context or file URL")
    }

    try validateIdentifier(sourcePane, name: "source pane")
    try validateIdentifier(workspace, name: "workspace")
    try validateIdentifier(tab, name: "tab")

    let filePath = fileURL.standardizedFileURL.path
    guard filePath.hasPrefix("/") && !filePath.contains("\0") else {
        try fail("Only absolute local file paths can be opened")
    }

    let requestedCwd = queryValue("cwd", in: components)
    let cwd: String
    var cwdIsDirectory = ObjCBool(false)
    if let requestedCwd,
       requestedCwd.hasPrefix("/"),
       FileManager.default.fileExists(atPath: requestedCwd, isDirectory: &cwdIsDirectory),
       cwdIsDirectory.boolValue {
        cwd = URL(fileURLWithPath: requestedCwd).standardizedFileURL.path
    } else {
        cwd = URL(fileURLWithPath: filePath).deletingLastPathComponent().path
    }

    let socket: String?
    if let value = queryValue("socket", in: components) {
        guard value.hasPrefix("/"), !value.contains("\0") else {
            try fail("The Herdr socket must be an absolute local path")
        }
        socket = value
    } else {
        socket = nil
    }

    let line: Int?
    if let value = queryValue("line", in: components) {
        guard let parsed = Int(value), parsed > 0 else {
            try fail("The requested line must be a positive integer")
        }
        line = parsed
    } else {
        line = nil
    }

    return LinkRequest(
        sourcePane: sourcePane,
        workspace: workspace,
        tab: tab,
        filePath: filePath,
        cwd: cwd,
        socket: socket,
        line: line
    )
}

func executable(named name: String, override: String, candidates: [String]) throws -> String {
    let environment = ProcessInfo.processInfo.environment
    let paths = [environment[override]].compactMap { $0 } + candidates
    for path in paths where FileManager.default.isExecutableFile(atPath: path) {
        return path
    }
    try fail("Could not find \(name); checked: \(paths.joined(separator: ", "))")
}

func run(
    _ executable: String,
    _ arguments: [String],
    environment additions: [String: String] = [:]
) throws -> CommandResult {
    let process = Process()
    let pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    process.standardOutput = pipe
    process.standardError = pipe
    var environment = ProcessInfo.processInfo.environment
    for (name, value) in additions { environment[name] = value }
    process.environment = environment

    try process.run()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    process.waitUntilExit()
    return CommandResult(
        status: process.terminationStatus,
        output: String(data: data, encoding: .utf8) ?? ""
    )
}

func runChecked(
    _ executable: String,
    _ arguments: [String],
    environment: [String: String] = [:],
    operation: String
) throws -> String {
    let result = try run(executable, arguments, environment: environment)
    guard result.status == 0 else {
        let detail = result.output.trimmingCharacters(in: .whitespacesAndNewlines)
        try fail(detail.isEmpty ? "\(operation) failed with status \(result.status)" : "\(operation) failed: \(detail)")
    }
    return result.output
}

func jsonObject(_ text: String, operation: String) throws -> [String: Any] {
    guard let data = text.data(using: .utf8),
          let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        try fail("Herdr returned invalid JSON for \(operation)")
    }
    return object
}

func nestedDictionary(_ object: [String: Any], _ keys: String...) -> [String: Any]? {
    var current = object
    for key in keys {
        guard let next = current[key] as? [String: Any] else { return nil }
        current = next
    }
    return current
}

func paneRecords(_ object: [String: Any]) -> [[String: Any]] {
    nestedDictionary(object, "result")?["panes"] as? [[String: Any]] ?? []
}

func listPanes(
    herdr: String,
    request: LinkRequest,
    environment: [String: String]
) throws -> [[String: Any]] {
    let output = try runChecked(
        herdr,
        ["pane", "list", "--workspace", request.workspace],
        environment: environment,
        operation: "herdr pane list"
    )
    let panes = paneRecords(try jsonObject(output, operation: "pane list"))
    guard panes.contains(where: {
        $0["pane_id"] as? String == request.sourcePane &&
        $0["workspace_id"] as? String == request.workspace &&
        $0["tab_id"] as? String == request.tab
    }) else {
        try fail("The source Herdr pane \(request.sourcePane) is no longer present in \(request.tab)")
    }
    return panes
}

func rightNeighbor(
    herdr: String,
    request: LinkRequest,
    environment: [String: String]
) throws -> String? {
    let output = try runChecked(
        herdr,
        ["pane", "neighbor", "--direction", "right", "--pane", request.sourcePane],
        environment: environment,
        operation: "finding the right Herdr pane"
    )
    let object = try jsonObject(output, operation: "pane neighbor")
    return nestedDictionary(object, "result", "neighbor")?["neighbor_pane_id"] as? String
}

func isNeovimPane(
    herdr: String,
    pane: String,
    environment: [String: String]
) throws -> Bool {
    let output = try runChecked(
        herdr,
        ["pane", "process-info", "--pane", pane],
        environment: environment,
        operation: "inspecting Herdr pane \(pane)"
    )
    let object = try jsonObject(output, operation: "pane process-info")
    let processes = nestedDictionary(object, "result", "process_info")?["foreground_processes"] as? [[String: Any]] ?? []
    return processes.contains { process in
        let names = [process["name"], process["argv0"]]
            .compactMap { $0 as? String }
            .map { URL(fileURLWithPath: $0).lastPathComponent }
        let argvName = (process["argv"] as? [String])?.first.map { URL(fileURLWithPath: $0).lastPathComponent }
        return names.contains("nvim") || argvName == "nvim"
    }
}

func serverAddress(for pane: String, in panes: [[String: Any]]) -> String? {
    guard let record = panes.first(where: { $0["pane_id"] as? String == pane }),
          let tokens = record["tokens"] as? [String: Any] else { return nil }
    return tokens["nvim_server"] as? String
}

func jsonString(_ value: String) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: [value])
    guard let encoded = String(data: data, encoding: .utf8) else {
        try fail("Could not encode file path for Neovim")
    }
    return String(encoded.dropFirst().dropLast())
}

func openRemotely(nvim: String, server: String, request: LinkRequest) throws {
    let path = try jsonString(request.filePath)
    var expressions = ["execute('drop ' . fnameescape(\(path)))"]
    if let line = request.line { expressions.append("cursor(\(line), 1)") }
    _ = try runChecked(
        nvim,
        ["--server", server, "--remote-expr", "[\(expressions.joined(separator: ", "))]"],
        operation: "opening \(request.filePath) in Neovim"
    )
}

func shellQuote(_ value: String) -> String {
    "'" + value.replacingOccurrences(of: "'", with: "'\"'\"'") + "'"
}

func createNeovimPane(
    herdr: String,
    nvim: String,
    request: LinkRequest,
    environment: [String: String]
) throws {
    _ = try listPanes(herdr: herdr, request: request, environment: environment)
    let splitOutput = try runChecked(
        herdr,
        [
            "pane", "split", "--pane", request.sourcePane,
            "--direction", "right", "--ratio", "0.5",
            "--cwd", request.cwd, "--focus",
        ],
        environment: environment,
        operation: "creating a right Herdr pane"
    )
    let split = try jsonObject(splitOutput, operation: "pane split")
    guard let pane = nestedDictionary(split, "result", "pane")?["pane_id"] as? String else {
        try fail("Herdr pane split did not return a pane ID")
    }

    _ = try runChecked(
        herdr,
        ["pane", "rename", pane, "neovim"],
        environment: environment,
        operation: "labeling the Neovim pane"
    )
    var command = "exec \(shellQuote(nvim))"
    if let line = request.line { command += " \(shellQuote("+\(line)"))" }
    command += " -- \(shellQuote(request.filePath))"
    _ = try runChecked(
        herdr,
        ["pane", "run", pane, command],
        environment: environment,
        operation: "starting Neovim"
    )
}

func handle(_ request: LinkRequest) throws {
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    let herdr = try executable(
        named: "herdr",
        override: "HERDR_NVIM_HERDR_PATH",
        candidates: ["\(home)/.local/bin/herdr", "/opt/homebrew/bin/herdr", "/usr/local/bin/herdr", "/usr/bin/herdr"]
    )
    let nvim = try executable(
        named: "nvim",
        override: "HERDR_NVIM_NVIM_PATH",
        candidates: ["\(home)/.local/bin/nvim", "/opt/homebrew/bin/nvim", "/usr/local/bin/nvim", "/usr/bin/nvim"]
    )
    var environment = ["HERDR_ENV": "1"]
    if let socket = request.socket { environment["HERDR_SOCKET_PATH"] = socket }

    let panes = try listPanes(herdr: herdr, request: request, environment: environment)
    if let right = try rightNeighbor(herdr: herdr, request: request, environment: environment),
       try isNeovimPane(herdr: herdr, pane: right, environment: environment) {
        guard let server = serverAddress(for: right, in: panes), !server.isEmpty else {
            try fail("Neovim is running in \(right) but has not advertised an RPC server. Restart Neovim after installing the Herdr integration.")
        }
        try openRemotely(nvim: nvim, server: server, request: request)

        let currentPanes = try listPanes(herdr: herdr, request: request, environment: environment)
        guard currentPanes.contains(where: { $0["pane_id"] as? String == right }),
              try rightNeighbor(herdr: herdr, request: request, environment: environment) == right else {
            try fail("The right Neovim pane moved while opening the file")
        }
        _ = try runChecked(
            herdr,
            ["pane", "focus", "--direction", "right", "--pane", request.sourcePane],
            environment: environment,
            operation: "focusing the Neovim pane"
        )
        return
    }

    try createNeovimPane(herdr: herdr, nvim: nvim, request: request, environment: environment)
}

do {
    guard CommandLine.arguments.count == 2 else {
        try fail("Usage: herdr-nvim-open 'herdr-nvim://open?...'")
    }
    try handle(parseRequest(CommandLine.arguments[1]))
} catch {
    FileHandle.standardError.write(Data("herdr-nvim-open: \(error.localizedDescription)\n".utf8))
    exit(1)
}
