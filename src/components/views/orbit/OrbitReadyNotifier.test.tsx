import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";

const toastMock = vi.fn();
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toastMock(...args) }));
const notifyMock = vi.fn();
vi.mock("@/lib/notifications", () => ({ notify: (...args: unknown[]) => notifyMock(...args) }));
let now = new Date("2026-10-11T18:00:00");
vi.mock("@/hooks/useOrbitReview", () => ({ useNow: () => now }));

import OrbitReadyNotifier, { ORBIT_READY_TOAST_ID } from "./OrbitReadyNotifier";
import { orbitStore } from "@/lib/orbitStore";
import { notifySettings } from "@/lib/notifySettings";

/** Monthly and yearly already opened, so only the week ending Oct 11 is new at 6 PM. */
function seenOlder() {
  orbitStore.markSeen("monthly", "2026-09");
  orbitStore.markSeen("yearly", "2025");
}

beforeEach(() => {
  localStorage.clear();
  orbitStore._reload();
  notifySettings._reset();
  toastMock.mockReset();
  notifyMock.mockReset();
  now = new Date("2026-10-11T18:00:00");
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

describe("OrbitReadyNotifier", () => {
  it("toasts a newly ready review once, with Open going to its kind", () => {
    seenOlder();
    orbitStore.setView("monthly");
    const onOpen = vi.fn();
    const { rerender } = render(<OrbitReadyNotifier onOpen={onOpen} />);

    expect(toastMock).toHaveBeenCalledTimes(1);
    const [title, options] = toastMock.mock.calls[0];
    expect(title).toBe("Weekly review ready");
    expect(options).toMatchObject({ id: ORBIT_READY_TOAST_ID, description: "Oct 5 – 11, 2026" });
    expect(orbitStore.getState().notified.weekly).toBe("2026-W41");

    act(() => options.action.onClick());
    expect(orbitStore.getState().view).toBe("weekly");
    expect(onOpen).toHaveBeenCalled();

    rerender(<OrbitReadyNotifier onOpen={onOpen} />);
    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("does not repeat on the next launch once announced", () => {
    seenOlder();
    orbitStore.markNotified([{ kind: "weekly", key: "2026-W41" }]);
    orbitStore._reload();
    render(<OrbitReadyNotifier onOpen={() => undefined} />);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("stays quiet for a review already opened", () => {
    seenOlder();
    orbitStore.markSeen("weekly", "2026-W41");
    render(<OrbitReadyNotifier onOpen={() => undefined} />);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("shares one toast between reviews ready together", () => {
    render(<OrbitReadyNotifier onOpen={() => undefined} />);
    expect(toastMock).toHaveBeenCalledTimes(1);
    expect(toastMock.mock.calls[0][0]).toBe("Weekly, monthly and yearly reviews ready");
  });

  it("sends a native notification only while the window is not focused", () => {
    seenOlder();
    vi.mocked(document.hasFocus).mockReturnValue(false);
    render(<OrbitReadyNotifier onOpen={() => undefined} />);
    expect(notifyMock).toHaveBeenCalledWith({ title: "Weekly review ready", body: "Oct 5 – 11, 2026" });
  });

  it("waits while the switch or Do Not Disturb silences it, then announces", () => {
    seenOlder();
    notifySettings.setFlag("reviews", false);
    render(<OrbitReadyNotifier onOpen={() => undefined} />);
    act(() => {
      notifySettings.setFlag("reviews", true);
      notifySettings.setFlag("doNotDisturb", true);
    });
    expect(toastMock).not.toHaveBeenCalled();
    expect(orbitStore.getState().notified.weekly).toBeUndefined();

    act(() => notifySettings.setFlag("doNotDisturb", false));
    expect(toastMock).toHaveBeenCalledTimes(1);
  });
});
