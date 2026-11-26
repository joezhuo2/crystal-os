import { describe, expect, it } from "vitest";
import { markFadeUnits } from "./viewFade";

const marked = (root: Element) => [...root.querySelectorAll("[data-view-fade]")].map((el) => el.id);

describe("markFadeUnits", () => {
  it("marks glass cards and the glass-free elements beside them, never their ancestors", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <header id="head"><h1 id="title">T</h1></header>
      <section id="grid">
        <div id="card" class="glass-card"><p id="inner">x</p></div>
        <div id="side"><span id="deep">y</span></div>
        <div id="wrap"><div id="hover" class="glass-card-hover"><div id="nested" class="glass-card"></div><i id="beside"></i></div></div>
      </section>`;
    markFadeUnits(root);
    expect(marked(root).sort()).toEqual(["beside", "card", "head", "hover", "nested", "side"].sort());
  });

  it("follows content that changes later", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div id="a"><span id="b"></span></div>`;
    markFadeUnits(root);
    expect(marked(root)).toEqual(["a"]);
    root.querySelector("#a")!.insertAdjacentHTML("beforeend", `<div id="c" class="glass-card"></div>`);
    markFadeUnits(root);
    expect(marked(root).sort()).toEqual(["b", "c"]);
  });
});
