import type { OnboardingTask } from "../../types/dashboard";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { TaskActionButton } from "./TaskActionButton";
import { TaskDetailContent } from "./TaskDetailContent";

interface TaskDetailModalProps {
  task: OnboardingTask | undefined;
  onClose: () => void;
}

export function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  return (
    <Modal
      open={Boolean(task)}
      title="Task details"
      onClose={onClose}
      footer={
        task && (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <TaskActionButton task={task} size="md" />
          </>
        )
      }
    >
      {task && <TaskDetailContent task={task} />}
    </Modal>
  );
}
