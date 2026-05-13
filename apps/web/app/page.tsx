import { WorkspaceShell } from '@/components/chat/workspace-shell';

/**
 * Keeps the page entrypoint intentionally thin so module orchestration lives in
 * reusable client components instead of the route file.
 */
export default function HomePage() {
  return <WorkspaceShell />;
}

