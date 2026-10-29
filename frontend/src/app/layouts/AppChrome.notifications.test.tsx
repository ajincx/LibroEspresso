import React, { useState } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { NotifDrawer, type AppNotification } from "./AppChrome";

const notifications: AppNotification[] = [
  {
    id: "notification-1",
    cat: "Inventory",
    title: "Count ready for review",
    body: "The closing count is ready.",
    time: "Just now",
    read: false,
    icon: "inv",
    entityId: "count-1",
    entityType: "INVENTORY_COUNT",
  },
  {
    id: "notification-2",
    cat: "Purchase order",
    title: "Order received",
    body: "The purchase order was received.",
    time: "Yesterday",
    read: true,
    icon: "po",
    entityId: "po-1",
    entityType: "PURCHASE_ORDER",
  },
];

function textOf(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");
}

function findButton(root: ReactTestInstance, text: string) {
  return root.findAllByType("button").find((button) => textOf(button) === text);
}

function Harness({
  deleteOne = async () => undefined,
  deleteAll = async () => undefined,
}: {
  deleteOne?: (id: string) => Promise<void>;
  deleteAll?: () => Promise<void>;
}) {
  const [items, setItems] = useState(notifications);
  return (
    <NotifDrawer
      open
      onClose={() => undefined}
      notifs={items}
      markAllRead={() => undefined}
      onOpenNotification={() => undefined}
      onDeleteNotification={async (id) => {
        await deleteOne(id);
        setItems((current) => current.filter((item) => item.id !== id));
      }}
      onDeleteAllNotifications={async () => {
        await deleteAll();
        setItems([]);
      }}
    />
  );
}

describe("notification deletion controls", () => {
  it("opens the three-dot menu and cancels individual deletion without changes", () => {
    const deleteOne = vi.fn(async () => undefined);
    const renderer = create(<Harness deleteOne={deleteOne} />);
    const action = renderer.root.findByProps({
      "aria-label": "Actions for Count ready for review",
    });

    act(() => action.props.onClick());
    act(() => findButton(renderer.root, "Delete notification")?.props.onClick());
    expect(textOf(renderer.root)).toContain(
      "Are you sure you want to delete this notification?",
    );
    act(() => findButton(renderer.root, "Cancel")?.props.onClick());

    expect(deleteOne).not.toHaveBeenCalled();
    expect(textOf(renderer.root)).toContain("Count ready for review");
    expect(textOf(renderer.root)).not.toContain(
      "Are you sure you want to delete this notification?",
    );
  });

  it("deletes one item and updates the unread count immediately", async () => {
    const deleteOne = vi.fn(async () => undefined);
    const renderer = create(<Harness deleteOne={deleteOne} />);
    act(() =>
      renderer.root
        .findByProps({ "aria-label": "Actions for Count ready for review" })
        .props.onClick(),
    );
    act(() => findButton(renderer.root, "Delete notification")?.props.onClick());

    await act(async () => {
      findButton(renderer.root, "Proceed")?.props.onClick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(deleteOne).toHaveBeenCalledWith("notification-1");
    expect(textOf(renderer.root)).not.toContain("Count ready for review");
    expect(textOf(renderer.root)).toContain("0 unread");
  });

  it("confirms delete all, clears the inbox, and disables Delete All", async () => {
    const deleteAll = vi.fn(async () => undefined);
    const renderer = create(<Harness deleteAll={deleteAll} />);

    act(() => findButton(renderer.root, "Delete All")?.props.onClick());
    expect(textOf(renderer.root)).toContain(
      "Are you sure you want to delete all your notifications?",
    );
    await act(async () => {
      findButton(renderer.root, "Proceed")?.props.onClick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(deleteAll).toHaveBeenCalledOnce();
    expect(textOf(renderer.root)).toContain("No notifications");
    expect(findButton(renderer.root, "Delete All")?.props.disabled).toBe(true);
  });

  it("keeps the notification and shows feedback when deletion fails", async () => {
    const renderer = create(
      <Harness deleteOne={async () => { throw new Error("Delete failed"); }} />,
    );
    act(() =>
      renderer.root
        .findByProps({ "aria-label": "Actions for Count ready for review" })
        .props.onClick(),
    );
    act(() => findButton(renderer.root, "Delete notification")?.props.onClick());
    await act(async () => {
      findButton(renderer.root, "Proceed")?.props.onClick();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(textOf(renderer.root)).toContain("Delete failed");
    expect(textOf(renderer.root)).toContain("Count ready for review");
  });
});
