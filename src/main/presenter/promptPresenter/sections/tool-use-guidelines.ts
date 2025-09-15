export function getToolUseGuidelinesSection(): string {
  let itemNumber = 1
  const guidelinesList: string[] = []

  guidelinesList.push(
    `${itemNumber++}. Analyze user intent, determine whether to call the tool based on its description, and select the most matching tool or tools.`
  )

  // First guideline is always the same
  guidelinesList.push(
    `${itemNumber++}. Assess what information you already have ,and proactively and clearly inquire about missing necessary parameters to ensure that the format of the call request fully complies with the tool interface specifications.`
  )

  // Remaining guidelines
  guidelinesList.push(
    `${itemNumber++}. If multiple actions are needed, use one tool at a time per message to accomplish the task iteratively, with each tool use being informed by the result of the previous tool use. Each step must be informed by the previous step's result.`
  )
  guidelinesList.push(
    `${itemNumber++}. Formulate your tool use using the XML format specified for each tool.`
  )
  guidelinesList.push(
    `${itemNumber++}. Properly handle any errors in tool calls, convert them into user-friendly prompts that users can understand, and do not expose technical details.`
  )
  guidelinesList.push(
    `${itemNumber++}. ALWAYS wait for user confirmation after each tool use before proceeding. Never assume the success of a tool use without explicit confirmation of the result from the user.`
  )

  // Join guidelines and add the footer
  return `# Tool Use Guidelines

${guidelinesList.join('\n')}

It is crucial to proceed step-by-step, waiting for the user's message after each tool use before moving forward with the task. This approach allows you to:
1. Confirm the success of each step before proceeding.
2. Address any issues or errors that arise immediately.
3. Adapt your approach based on new information or unexpected results.
4. Ensure that each action builds correctly on the previous ones.

By waiting for and carefully considering the user's response after each tool use, you can react accordingly and make informed decisions about how to proceed with the task. This iterative process helps ensure the overall success and accuracy of your work.`
}
