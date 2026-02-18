import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RulesetCard } from "./RulesetCard";
import type { Ruleset } from "../lib/types";

interface RulesetListProps {
  rulesets: Ruleset[];
  onToggleEnabled: (id: string, enabled: boolean) => void;
  onExecute: (id: string) => void;
  onEdit: (ruleset: Ruleset) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
  executing: boolean;
}

function SortableItem({
  ruleset,
  index,
  ...props
}: {
  ruleset: Ruleset;
  index: number;
} & Omit<React.ComponentProps<typeof RulesetCard>, "ruleset" | "index">) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: ruleset.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <RulesetCard ruleset={ruleset} index={index} {...props} />
    </div>
  );
}

export function RulesetList({
  rulesets,
  onToggleEnabled,
  onExecute,
  onEdit,
  onDelete,
  onReorder,
  executing,
}: RulesetListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = rulesets.findIndex((r) => r.id === active.id);
      const newIndex = rulesets.findIndex((r) => r.id === over.id);
      const reordered = arrayMove(rulesets, oldIndex, newIndex);
      onReorder(reordered.map((r) => r.id));
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={rulesets.map((r) => r.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2 p-3">
          {rulesets.map((ruleset, index) => (
            <SortableItem
              key={ruleset.id}
              ruleset={ruleset}
              index={index}
              onToggleEnabled={onToggleEnabled}
              onExecute={onExecute}
              onEdit={onEdit}
              onDelete={onDelete}
              executing={executing}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
