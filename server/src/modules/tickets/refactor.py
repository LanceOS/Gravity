import re

with open('server/src/modules/tickets/routes.ts', 'r') as f:
    content = f.read()

def replace_project_access(match):
    header = match.group(1) 
    body = match.group(2)
    return f"{header}\n    await withProjectAccess(req, res, getProjectIdFromRequest(req), async (projectId, userId) => {{{body}\n    }});\n  }});"

project_pattern = re.compile(
    r"(router\.(?:post|patch|delete|get)\('[^']+', async \(req, res\) => \{)\n"
    r"    const projectId = getProjectIdFromRequest\(req\);\n"
    r"    if \(!projectId.*?\)\s*\{\n"
    r"      res\.status\(400\)\.json\(\{ error: 'Project ID.*?' \}\);\n"
    r"      return;\n"
    r"    \}\n\n"
    r"    const auth = await authorizeProjectAccess\(req, projectId\);\n"
    r"    if \(!auth\.allowed\)\s*\{\n"
    r"      res\.status\(auth\.status\)\.json\(\{ error: auth\.error \}\);\n"
    r"      return;\n"
    r"    \}\n(.*?\n)  \}\);", re.DOTALL)

content = project_pattern.sub(replace_project_access, content)

def replace_ticket_access(match):
    header = match.group(1) 
    pre_body = match.group(2)
    ticket_id_var = match.group(3) 
    body = match.group(4)
    return f"{header}\n{pre_body}    await withTicketAccess(req, res, {ticket_id_var}, async (ticket, userId) => {{{body}\n      }} catch (error) {{\n        res.status(500).json({{ error: error instanceof Error ? error.message : 'Failed to process request.' }});\n      }}\n    }});\n  }});"

ticket_pattern = re.compile(
    r"(router\.(?:get|post|patch|delete)\('[^']+', async \(req, res\) => \{)\n(.*?)"
    r"    try \{\n"
    r"      const ([a-zA-Z0-9_]+) = normalizeRouteParam\(.*?\);\n"
    r"      const ticket = await getTicketById\(\3.*?\);\n"
    r"      if \(!ticket\) \{\n"
    r"        res\.status\(404\)\.json\(\{ error: 'Ticket not found\.' \}\);\n"
    r"        return;\n"
    r"      \}\n\n"
    r"      const auth = await authorizeProjectAccess\(req, ticket\.projectId\);\n"
    r"      if \(!auth\.allowed\) \{\n"
    r"        res\.status\(auth\.status\)\.json\(\{ error: auth\.error \}\);\n"
    r"        return;\n"
    r"      \}\n(.*?)    \} catch \(error\) \{\n"
    r"      res\.status\(500\)\.json.*?\n"
    r"    \}\n"
    r"  \}\);", re.DOTALL)

content = ticket_pattern.sub(replace_ticket_access, content)

with open('server/src/modules/tickets/routes.ts', 'w') as f:
    f.write(content)
