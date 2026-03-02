# Go Modernize Checklist (Distilled from go/analysis modernize pass)

Use this checklist while refactoring older code.

## 1. Confirm minimum supported Go version
- Read the `go` directive in `go.mod` and verify CI/runtime toolchain versions.
- Apply only modernizations supported by the minimum toolchain in scope.
- Keep compatibility helpers when maintaining older branches.

## 2. Apply version-gated modernizations (full enabled suite coverage)
- `any` (Go 1.18+): replace `interface{}` with `any`.
- `fmtappendf` (Go 1.19+): replace `[]byte(fmt.Sprint*...)` patterns with `fmt.Append*`.
- `forvar` (Go 1.22+): remove redundant loop-variable re-declarations in `range` loops.
- `mapsloop` (Go 1.23+): use `maps.Copy`/`maps.Insert`/`maps.Collect` (and `maps.Clone` when applicable) when equivalent.
- `minmax` (Go 1.21+): replace simple conditional min/max assignments with builtin `min`/`max`.
- `newexpr` (Go 1.26+): prefer `new(expr)` when simplifying pointer helper wrappers.
- `omitzero` (Go 1.24+): evaluate `omitempty` to `omitzero` for struct fields.
- `plusbuild` (Go 1.18+ tag format): remove obsolete `//+build` when canonical `//go:build` exists.
- `rangeint` (Go 1.22+): prefer `for i := range n` when semantics match.
- `reflecttypefor` (Go 1.22+): prefer `reflect.TypeFor[T]` for compile-time-known types.
- `slicescontains` (Go 1.21+): replace membership loops with `slices.Contains`/`ContainsFunc`.
- `slicessort` (Go 1.21+): replace ordered-type `sort.Slice` use with `slices.Sort`.
- `stditerators` (iterator-capable toolchains): prefer iterator APIs over `Len`/`At` loops where equivalent.
- `stringscut` (Go 1.18+): use `strings.Cut`/`bytes.Cut` over `Index` + slicing patterns.
- `stringscutprefix` (Go 1.20+): use `CutPrefix`/`CutSuffix` over paired `Has*` + `Trim*`.
- `stringsseq` (Go 1.24+): use `SplitSeq`/`FieldsSeq` when only iterating results.
- `stringsbuilder` (Go 1.10+): replace repeated loop concatenation with `strings.Builder` (widely baseline now, but still part of modernize suite).
- `testingcontext` (Go 1.24+): use `t.Context()` in tests where cancellation lifecycle is simple.
- `unsafefuncs` (Go 1.17+): prefer `unsafe.Add` over manual `uintptr` arithmetic.
- `waitgroup` (Go 1.25+): replace `Add` + goroutine + `Done` boilerplate with `WaitGroup.Go`.

## 3. Optional disabled analyzers in upstream modernize suite
- `appendclipped`: disabled upstream by default due to nil-preservation behavior caveats.
- `bloop`: disabled upstream by default due to benchmark behavior/perf caveats.
- `slicesdelete`: disabled upstream by default due to behavioral differences around element zeroing.

## 4. Guard semantics before applying fixes
- Do not replace float min/max logic when NaN behavior is intentional or observable.
- Re-check nilness-sensitive slice/map transformations before bulk replacement.
- Preserve meaningful inline comments when loops collapse to helper calls.
- Keep behavior-changing updates (for example `omitempty` to `omitzero`) in separate commits.

## 5. Batch and verify
- Apply one analyzer family per commit when possible (`any`, `strings*`, `maps/slices`, etc.).
- Run `go vet ./...` and `go test ./...` after each modernization batch.
- Run non-mutating formatting checks (`gofmt -l`) and fail if files are reported.
- Record executed commands and outcomes in the PR description or review notes.

## Source pointers
- Modernize analyzer source (pinned commit for deterministic coverage): `https://github.com/golang/tools/blob/b365b0a1509ccb1f7568a67499c6db90a6928d7c/go/analysis/passes/modernize/modernize.go`
- Effective Go: `https://go.dev/doc/effective_go`
- Google Go Style: `https://google.github.io/styleguide/go/`
