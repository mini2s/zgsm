import React, { useEffect, useRef, useState, useMemo } from "react"
import { useTranslation } from "react-i18next"

import MarkdownBlock from "../common/MarkdownBlock"
import { Lightbulb, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

interface ReasoningBlockProps {
	content: string
	ts: number
	isStreaming: boolean
	isLast: boolean
	metadata?: any
}

/**
 * Render reasoning with a heading and a simple timer.
 * - Heading uses i18n key chat:reasoning.thinking
 * - Timer runs while reasoning is active (no persistence)
 * - Shows only the latest line by default with expand/collapse functionality
 */
export const ReasoningBlock = ({ content, isStreaming, isLast }: ReasoningBlockProps) => {
	const { t } = useTranslation()

	const startTimeRef = useRef<number>(Date.now())
	const [elapsed, setElapsed] = useState<number>(0)
	const [isExpanded, setIsExpanded] = useState<boolean>(false)

	// Simple timer that runs while streaming
	useEffect(() => {
		if (isLast && isStreaming) {
			const tick = () => setElapsed(Date.now() - startTimeRef.current)
			tick()
			const id = setInterval(tick, 1000)
			return () => clearInterval(id)
		}
	}, [isLast, isStreaming])

	// Extract the latest line from content for collapsed view
	const latestLine = useMemo(() => {
		if (!content?.trim()) return ""

		// Split content into lines and get the last non-empty line
		const lines = content
			.trim()
			.split("\n")
			.filter((line) => line.trim())
		if (lines.length === 0) return ""

		// Get the last line and limit its length for better display
		const lastLine = lines[lines.length - 1].trim()
		return lastLine.length > 100 ? lastLine.substring(0, 100) + "..." : lastLine
	}, [content])

	const seconds = Math.floor(elapsed / 1000)
	const secondsLabel = t("chat:reasoning.seconds", { count: seconds })

	const handleToggleExpand = () => {
		setIsExpanded(!isExpanded)
	}

	return (
		<div>
			<div className="flex items-center justify-between mb-2.5 pr-2">
				<div className="flex items-center gap-2">
					<Lightbulb className="w-4" />
					<span className="font-bold text-vscode-foreground">{t("chat:reasoning.thinking")}</span>
				</div>
				<div className="flex items-center gap-2">
					{elapsed > 0 && (
						<span className="text-sm text-vscode-descriptionForeground tabular-nums flex items-center gap-1">
							{secondsLabel}
						</span>
					)}
					{(content?.trim()?.length ?? 0) > 0 && (
						<button
							onClick={handleToggleExpand}
							className="ml-2 p-1 rounded hover:bg-vscode-toolbar-hoverBackground transition-colors duration-150 flex items-center gap-1"
							title={isExpanded ? t("chat:task.collapse") : t("chat:task.expand")}>
							{isExpanded ? (
								<ChevronUp className="w-3 h-3 text-vscode-descriptionForeground" />
							) : (
								<ChevronDown className="w-3 h-3 text-vscode-descriptionForeground" />
							)}
						</button>
					)}
				</div>
			</div>
			{(content?.trim()?.length ?? 0) > 0 && (
				<div className="border-l border-vscode-descriptionForeground/20 ml-2 pl-4 pb-1 text-vscode-descriptionForeground">
					{isExpanded ? (
						<div className="italic transition-all duration-1000 ease-in-out">
							<MarkdownBlock markdown={content} />
						</div>
					) : (
						<p
							className={cn(
								"italic transition-all duration-1000 ease-in-out cursor-pointer hover:bg-vscode-list-hoverBackground/20 rounded leading-relaxed whitespace-nowrap overflow-hidden text-ellipsis",
								isLast ? "animate-pulse" : "",
							)}
							style={{
								fontSize: "13px",
							}}
							onClick={handleToggleExpand}>
							{latestLine}
						</p>
					)}
				</div>
			)}
		</div>
	)
}
