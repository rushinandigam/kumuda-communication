import { Suspense } from "react";

import { getWorkflowsApiV1WorkflowFetchGet, listFoldersApiV1FolderGet } from "@/client/sdk.gen";
import type { FolderResponse, WorkflowListResponse } from "@/client/types.gen";
import { Card, CardContent } from "@/components/ui/card";
import { CreateWorkflowButton } from "@/components/workflow/CreateWorkflowButton";
import { AgentFolderView } from "@/components/workflow/folders/AgentFolderView";
import { CreateFolderButton } from "@/components/workflow/folders/CreateFolderButton";
import { UploadWorkflowButton } from "@/components/workflow/UploadWorkflowButton";
import { getServerAccessToken } from "@/lib/auth/server";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";

async function WorkflowList() {
  let workflows: WorkflowListResponse[] = [];
  let folders: FolderResponse[] = [];

  try {
    const token = await getServerAccessToken();
    if (!token) {
      return (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Please sign in to view your voice agents.
          </CardContent>
        </Card>
      );
    }

    const [workflowRes, folderRes] = await Promise.all([
      getWorkflowsApiV1WorkflowFetchGet({
        headers: { Authorization: `Bearer ${token}` },
      }),
      listFoldersApiV1FolderGet({
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    workflows = workflowRes.data ?? [];
    folders = folderRes.data ?? [];
  } catch (error) {
    logger.error("[VoiceAgents] Error fetching data:", error);
  }

  return (
    <AgentFolderView
      workflows={workflows}
      folders={folders}
    />
  );
}

export default function VoiceAgentsPage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Voice Agents</h2>
          <p className="text-muted-foreground text-sm">Manage your AI voice agent workflows</p>
        </div>
        <div className="flex items-center gap-2">
          <CreateFolderButton />
          <UploadWorkflowButton />
          <CreateWorkflowButton />
        </div>
      </div>

      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="h-32 animate-pulse bg-muted rounded-lg" />
              </Card>
            ))}
          </div>
        }
      >
        <WorkflowList />
      </Suspense>
    </div>
  );
}
