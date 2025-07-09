import { ToolArgs } from "./types"

export function getExecuteCommandDescription(args: ToolArgs): string | undefined {
	return `## execute_command
Description: Request to execute a CLI command on the system. Use this when you need to perform system operations or run specific commands to accomplish any step in the user's task. You must tailor your command to the user's system and provide a clear explanation of what the command does. For command chaining, use the appropriate chaining syntax for the user's shell. Prefer to execute complex CLI commands over creating executable scripts, as they are more flexible and easier to run. Prefer relative commands and paths that avoid location sensitivity for terminal consistency, e.g: \`touch ./testdata/example.file\`, \`dir ./examples/model1/data/yaml\`, or \`go test ./cmd/front --config ./cmd/front/config.yml\`. If directed by the user, you may open a terminal in a different directory by using the \`cwd\` parameter.

For command chaining in PowerShell on Windows, use the pipe operator \`| \` to pass output from one command to another. Examples:
- \`Get-ChildItem -Path .\\logs | Where-Object { $\_.LastWriteTime -gt (Get-Date).AddDays(-1) }\`: Lists log files modified in the last day.
- \`Get-Content .\\data\\input.txt | ForEach-Object { $\_.ToUpper() } | Set-Content .\\data\\output.txt\`: Reads a file, converts each line to uppercase, and saves the result to another file.
- \`Get-Process | Where-Object { $\_.CPU -gt 100 } | Sort-Object CPU -Descending | Select-Object -First 5\`: Finds the top 5 processes by CPU usage.

These examples demonstrate how to effectively chain commands in PowerShell to perform complex operations efficiently.

Parameters:
- command: (required) The CLI command to execute. This should be valid for the current operating system. Ensure the command is properly formatted and does not contain any harmful instructions.
- cwd: (optional) The working directory to execute the command in (default: ${args.cwd})
Usage:
<execute_command>
<command>Your command here</command>
<cwd>Working directory path (optional)</cwd>
</execute_command>

Example: Requesting to execute npm run dev
<execute_command>
<command>npm run dev</command>
</execute_command>

Example: Requesting to execute ls in a specific directory if directed
<execute_command>
<command>ls -la</command>
<cwd>/home/user/projects</cwd>
</execute_command>`
}
