# Go Architecture Judgment

Use this reference when a change materially affects package boundaries, APIs,
interfaces, dependency ownership, global state, or mutable data.

## Prefer Direct Structure

Start in the package that owns the behavior. Extract a package when it creates a
clear domain or dependency boundary, not merely to separate file roles.

Layer names such as `service`, `repository`, `controller`, and `manager` are
warning signs when they divide one cohesive operation into pass-through APIs.
They are not automatically wrong: report or remove the layer only when it adds
indirection without meaningful ownership, reuse, isolation, or compatibility.

Avoid catch-all `utils`, `helpers`, and `common` packages. Put behavior with the
domain that gives it meaning, or leave a small helper local.

Do not treat `internal` or `pkg` as inherently good or bad. Inspect what
visibility, compatibility, generation, or repository convention they enforce.

## Make Abstractions Earn Their Cost

Start with functions and concrete types. Introduce an interface at the consuming
boundary when a real consumer needs substitution or a narrow external boundary
benefits from it. A test can justify a seam, but not automatically a broad
provider-owned interface or dependency framework.

Before adding an interface, generic type, option system, or owner struct, ask:

- What current caller or alternate implementation needs it?
- What behavior or ownership does it make clearer?
- Can a direct parameter, function, or concrete type solve the present problem?
- Is the abstraction hiding effects or merely moving code between files?

Use generics to share a real algorithm across types, not to recreate inheritance,
repositories, services, or type hierarchies.

Functional options are appropriate for evolving public APIs with substantial
optional configuration. A small options struct or direct parameters are often
clearer for internal code.

## Constructors And Zero Values

Prefer a useful zero value when it is honest. Use a constructor when it validates
invariants, establishes required dependencies, allocates owned resources, or
prevents invalid states. Do not add a constructor merely because the type is a
struct.

A concrete owner type is useful when dependencies or resources share a real
lifecycle. Do not introduce `App`, `Runner`, `Service`, or `Manager` solely
because work has several steps; a direct function may be clearer.

## Globals And Test Seams

Avoid mutable package-global state when multiple instances, concurrency, or test
isolation matter. Before replacing a global with a dependency container, try the
smallest alternative:

- pass a value or function to the operation that needs it
- keep a helper local
- use `t.TempDir`, `httptest`, or the real standard-library boundary
- construct a small concrete owner only when several operations share lifecycle

Do not create clock, filesystem, process, or client interfaces automatically.
Use a narrow interface only when the code genuinely needs interchangeable
behavior.

## API And Data Ownership

Export the minimum stable surface callers need. Avoid exposing implementation
types to make tests convenient. In mature repositories, public APIs, protocol
shims, aliases, generated types, and persisted state may be hard constraints;
do not modernize them incidentally.

Choose pointer or value semantics based on mutation, sharing, identity, and copy
cost—not a blanket size rule. Make ownership of maps, slices, pointers,
protobufs, and state explicit. A shallow copy does not transfer ownership of
nested mutable values.

Prefer directional dependencies. A package may depend on another domain package;
all wiring does not need to happen in `main`. Cycles and pass-through layers are
evidence that boundaries need reconsideration.
