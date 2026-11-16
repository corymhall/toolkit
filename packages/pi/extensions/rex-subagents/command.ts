import { basename, isAbsolute } from "node:path";

/** Preserve the running Pi installation, including standalone and Node launchers. */
export function piCommand(executable: string, argv: string[]): string[] {
  if (/^node(?:\.exe)?$/.test(basename(executable))) {
    if (!argv[1] || !isAbsolute(argv[1]))
      throw new Error("Cannot identify the current Pi entry point.");
    return [executable, argv[1]];
  }
  return [executable];
}
