import { spawnSync } from 'node:child_process';

/**
 * Locate a Python interpreter for the generated-code tests.
 * Set LANGGRAPH_CAD_PYTHON to point at a venv that has langgraph installed.
 */
export function findPython() {
  const candidates = [process.env.LANGGRAPH_CAD_PYTHON, 'python3', 'python'].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim() === '3') return candidate;
  }
  return null;
}

export function hasLangGraph(python) {
  if (!python) return false;
  return spawnSync(python, ['-c', 'import langgraph.graph'], { encoding: 'utf8' }).status === 0;
}
