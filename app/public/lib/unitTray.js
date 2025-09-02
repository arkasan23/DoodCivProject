// app/public/lib/unitTray.js
import { supabase } from "../supabaseClient.js";

/**
 * Very small, self-contained unit tray.
 * - Shows each unit with its cost (fetched from Supabase).
 * - Greys out rows you can't afford or haven't unlocked yet.
 * - Calls onSpawn(unit) when clicked and allowed.
 */
export default class unitTray extends Phaser.GameObjects.Container {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {Array<{id:string,name:string,tier:number,iconKey:string}>} units
   * @param {() => number} getGold            callback returning current gold
   * @param {() => number} getUnlockedTier    callback returning max unlocked tier
   * @param {(unit:object) => void} onSpawn   when a unit is selected
   */
  constructor(scene, x, y, units, getGold, getUnlockedTier, onSpawn) {
    super(scene, x, y);
    scene.add.existing(this);

    this.units = units || [];
    this.getGold = getGold || (() => 0);
    this.getUnlockedTier = getUnlockedTier || (() => 1);
    this.onSpawn = onSpawn || (() => {});
    this.rows = [];

    this._build();
  }

  _build() {
    this.removeAll(true);
    this.rows = [];

    let y = 0;
    for (const u of this.units) {
      const row = this.scene.add.container(0, y);
      const bg = this.scene.add.rectangle(0, 0, 220, 36, 0x1e1e2f, 0.55).setOrigin(0);
      const icon = this.scene.add.image(8 + 16, 18, u.iconKey).setDisplaySize(28, 28).setOrigin(0.5);
      const label = this.scene.add.text(48, 8, `${u.name} — …`, {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: "14px",
        color: "#ffffff",
      });

      row.add([bg, icon, label]);
      row.setSize(220, 36);
      row.setInteractive(new Phaser.Geom.Rectangle(0, 0, 220, 36), Phaser.Geom.Rectangle.Contains);
      row.on("pointerdown", () => {
        if (!this._isUnlocked(u) || !this._isAffordable(row.cost)) return;
        this.onSpawn(u);
      });

      // Store references for later updates
      row.unit = u;
      row.label = label;
      row.cost = null;

      // Fetch cost asynchronously (no top-level await)
      this._fetchCost(u.id).then((cost) => {
        row.cost = cost;
        label.setText(`${u.name} — ${cost ?? "?"}`);
        this._applyState(row);
      });

      this.add(row);
      this.rows.push(row);
      y += 40;
    }

    // First pass styling
    this.updateAffordability();
  }

  async _fetchCost(unitName) {
    try {
      const { data, error } = await supabase
        .from("units_data")
        .select("cost")
        .eq("name", unitName)
        .single();
      if (error) throw error;
      return data?.cost ?? null;
    } catch (err) {
      console.error(`Failed to fetch cost for ${unitName}:`, err);
      return null;
    }
  }

  _isUnlocked(unit) {
    return this.getUnlockedTier() >= (unit.tier ?? 1);
  }

  _isAffordable(cost) {
    if (cost == null) return false;
    return this.getGold() >= cost;
  }

  _applyState(row) {
    const unlocked = this._isUnlocked(row.unit);
    const affordable = this._isAffordable(row.cost);
    const alpha = unlocked ? 1 : 0.35;

    row.setAlpha(alpha);
    if (row.input) row.input.enabled = unlocked && affordable;
    row.label.setColor(affordable && unlocked ? "#ffffff" : "#aaaaaa");
  }

  /** Call this whenever gold or tier changes */
  updateAffordability() {
    for (const row of this.rows) {
      this._applyState(row);
    }
  }

  /** If your unit list changes at runtime */
  rebuild(units) {
    this.units = units.slice();
    this._build();
  }
}
