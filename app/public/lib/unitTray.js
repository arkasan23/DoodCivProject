import { supabase } from "../supabaseClient.js";

export default class unitTray {
  /**
   * @param {Phaser.Scene} scene
   * @param {{
   *   units: Array<{ id:string, name:string, tier:number, iconKey?:string }>,
   *   getGold?: () => number,
   *   onBuy?: (unitId:string) => void
   * }} opts
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.units = Array.isArray(opts.units) ? opts.units : [];
    this.getGold = typeof opts.getGold === "function" ? opts.getGold : () => 0;
    this.onBuy = typeof opts.onBuy === "function" ? opts.onBuy : () => {};

    // runtime state
    this.currentTier = 1;
    this.gold = 0;

    // supabase cache: { [unitId]: number }
    this.costCache = Object.create(null);

    // UI roots
    this.container = this.scene.add.container(0, 0);
    this.titleText = null;
    this.rows = []; // [{root, nameText, costText}]

    this._build();
  }

  // ---------------------------------------------------------------------------
  // Public API used by GameScene + UnitProgression
  // ---------------------------------------------------------------------------

  /** Called by GameScene.playerGold setter */
  updateTrayAffordability(gold) {
    this.gold = gold ?? 0;
    this._refreshAffordabilityTint();
  }

  /** UnitProgression will call this when its notion of state changes */
  _applyState(state = {}) {
    if (typeof state.round === "number" && typeof state.turnsPerTier === "number") {
      // mirror UnitProgression's math: tier = 1 + floor((round-1)/turnsPerTier)
      const tier = Math.max(1, 1 + Math.floor((state.round - 1) / state.turnsPerTier));
      this.currentTier = tier;
    } else if (typeof state.currentTier === "number") {
      this.currentTier = Math.max(1, state.currentTier);
    }
    if (typeof state.gold === "number") this.gold = state.gold;
    this._rebuildRows(); // lock/unlock markers may change
  }

  /** UnitProgression asks if a unit is unlocked at current tier */
  _isUnlocked(unit) {
    return (unit?.tier ?? 1) <= this.currentTier;
  }

  /** Tidy up */
  destroy() {
    this.rows.forEach(r => r.root?.destroy());
    this.rows = [];
    this.titleText?.destroy();
    this.container?.destroy();
  }

  // ---------------------------------------------------------------------------
  // Internal UI build
  // ---------------------------------------------------------------------------

  _build() {
    // Title
    this.titleText = this.scene.add.text(12, 8, "Units", {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "20px",
      color: "#cfd8ff"
    });
    this.container.add(this.titleText);

    // background strip (left panel look)
    const bg = this.scene.add.rectangle(0, 0, 220, this.scene.scale.height, 0x0b123d, 1);
    bg.setOrigin(0, 0);
    bg.setDepth(-1);
    this.container.add(bg);

    // keep the panel full height on resize
    this.scene.scale.on("resize", (size) => {
      bg.setSize(220, size.height);
    });

    // first paint
    this._rebuildRows();
  }

  _clearRows() {
    this.rows.forEach(r => r.root.destroy());
    this.rows = [];
  }

  _rebuildRows() {
    this._clearRows();

    // Group by tier, sorted
    const byTier = new Map();
    for (const u of this.units) {
      const t = u.tier ?? 1;
      if (!byTier.has(t)) byTier.set(t, []);
      byTier.get(t).push(u);
    }
    const tiers = Array.from(byTier.keys()).sort((a, b) => a - b);

    let y = 40;
    for (const tier of tiers) {
      // Tier header
      const header = this.scene.add.text(12, y, `Tier ${tier}`, {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: "16px",
        color: tier <= this.currentTier ? "#9ad2ff" : "#66719a"
      });
      this.container.add(header);
      y += 8;

      for (const unit of byTier.get(tier)) {
        y += 28;
        this._makeRow(unit, y, tier <= this.currentTier);
      }
      y += 18;
    }

    // after we paint rows, ensure affordability tint matches current gold
    this._refreshAffordabilityTint();
  }

  _makeRow(unit, y, unlocked) {
    // root container so we can destroy per-row easily
    const root = this.scene.add.container(0, 0);
    this.container.add(root);

    const nameText = this.scene.add.text(24, y, unlocked ? unit.name : "locked", {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "14px",
      color: unlocked ? "#d7e3ff" : "#6b7399"
    }).setAlpha(0.9);
    root.add(nameText);

    const costText = this.scene.add.text(160, y, "?", {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "14px",
      color: "#ffd27d"
    }).setAlpha(unlocked ? 1 : 0.5);
    costText.setOrigin(1, 0);
    root.add(costText);

    // fetch + paint cost (from cache or Supabase)
    this._ensureCost(unit.id).then((c) => {
      costText.setText(String(c ?? "?"));
      this._tintByAffordability(costText, c);
    });

    // click-to-buy ONLY if unlocked
    if (unlocked) {
      // bigger hit area for easier clicking
      const hit = this.scene.add.rectangle(110, y + 8, 200, 22, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on("pointerdown", () => this.onBuy(unit.id));
      root.add(hit);
    }

    this.rows.push({ root, nameText, costText, unit, unlocked });
  }

  _refreshAffordabilityTint() {
    for (const row of this.rows) {
      if (!row.unlocked) continue;
      const cost = this.costCache[row.unit.id];
      if (typeof cost === "number") {
        this._tintByAffordability(row.costText, cost);
      }
    }
  }

  _tintByAffordability(costText, cost) {
    if (typeof cost !== "number") return;
    const canAfford = (this.gold ?? 0) >= cost;
    // white if affordable, dim if not
    costText.setColor(canAfford ? "#ffffff" : "#999aa7");
  }

  // ---------------------------------------------------------------------------
  // Supabase helpers
  // ---------------------------------------------------------------------------

  async _ensureCost(unitId) {
    if (!unitId) return undefined;
    if (unitId in this.costCache) return this.costCache[unitId];

    const { data, error } = await supabase
      .from("units_data")
      .select("cost")
      .eq("name", unitId)
      .single();

    if (error) {
      console.error("UnitTray: failed to fetch cost for", unitId, error);
      this.costCache[unitId] = undefined;
    } else {
      this.costCache[unitId] = data?.cost ?? undefined;
    }
    return this.costCache[unitId];
  }
}
