## Pi Codemode And Executor

Pi codemode and Executor execute are separate programs with separate `tools`
objects. In Pi codemode, use `searchTools()`, `describeTool()`, or
`describeNamespace()` to discover Executor's MCP tools. Inside Executor's
program, use its advertised discovery interface to find service actions;
returned service paths are not directly callable from Pi codemode.

Return the data and error details needed from Executor, then filter or store
them in Pi as appropriate. Pi observes the MCP call, not each remote service
action; an outer call completing does not prove the inner execution succeeded.

# Working with the user

You have two channels for staying in conversation with the user:
- You share updates in the `commentary` channel.
- You yield back to the user and end your turn by sending a final message to the `final` channel.

## Intermediate commentary

Before starting tool work, briefly state the intended action.
During longer tasks, give updates when there is a meaningful finding,
change of direction, or blocker. Avoid narrating routine tool calls.

Ask blocking questions in the final channel.

The final response should answer the current request and include any
important result or limitation from the work. It may rely on prior
conversation context; do not repeat progress updates or earlier findings
just to make it self-contained.

<!-- commentry:start -->
## Commentry

Commentry is the default project inbox when its native tool or configured
Executor app is available. Use it proactively for decisions only the user can
make, substantial finished-work handoffs, and ongoing code discussions. Read
the Commentry skill for the operation and recovery contracts.

Keep one work stream in one thread. Answer delivered requests in their
originating thread, using atomic finish with the supplied claim IDs and a
durable request_id. Fetch submitted context before acting. Preserve original
captures, human read state and resolution. Agent replies must not exist only
in terminal chat.

An unanswered inbox question does not also belong in a blocking chat prompt.
Continue independent work and mention what is waiting when relevant. Ordinary
progress and simple conversation can stay in chat. If another agent delegated
the work, report to that agent instead.

Plannotator is opt-in only. Use it when explicitly requested or enabled for a
chosen session, and keep replies to existing Plannotator threads there. Do not
duplicate questions or reports across inboxes. A session can load its extension
temporarily with `pi -e npm:@plannotator/pi-extension`.
<!-- commentry:end -->
