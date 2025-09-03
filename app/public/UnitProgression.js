// UnitProgression.js
// Lightweight unit list + 5-round tier progression HUD for Phaser 3.

import UnitTray from "./lib/unitTray.js";
import Unit from "./lib/unit.js"; // used when spawning from the tray

export default class unitProgression {
  /**
   * @param {Phaser.Scene} scene
   * @param {Object} opts
   * @param {Array<{id:string,name:string,tier:number,iconKey?:string}>} opts.units
   * @param {number} [opts.turnsPerTier=5]
   * @param {number} [opts.panelWidth=260]
   * @param {(tier:number)=>void} [opts.onTierUnlock]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.units = (opts.units || [])
      .slice()
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
    this.turnsPerTier = opts.turnsPerTier ?? 5;
    this.panelWidth = opts.panelWidth ?? 260;
    this.onTierUnlock = opts.onTierUnlock;

    this.ownerIndex = opts.ownerIndex ?? 0;
    this.UnitClass = opts.UnitClass ?? Unit;

    this.unlockedTier = 1;
    this.bg = null;
    this.title = null;
    this.list = null;
    this.rows = []; // { unit, container, tray, label, lockOverlay }

    this._onResize = this._onResize.bind(this);
    this._onTurnChanged = this._onTurnChanged.bind(this);

    this._buildUI();
    this.applyRound(this._currentRound());

    // listen for round changes (GameScene emits "turn:changed")
    this.scene.game?.events?.on("turn:changed", this._onTurnChanged);
    this.scene.scale.on("resize", this._onResize);
  }

  // ---------------- public API ----------------

  updateTrayAffordability(playerGold) {
    for (const row of this.rows) {
      if (!row?.tray) continue;
      // locked rows don’t need an affordance change
      if (row.unit.tier > this.unlockedTier) continue;

      if (row.tray.cost != null) {
        row.tray.setAffordable(playerGold >= row.tray.cost);
      }
    }
  }

  /** Call when your round changes (if you don’t emit "turn:changed"). */
  applyRound(round) {
    const safeRound = Number.isFinite(round) ? round : 1;
    const newTier = Math.floor((Math.max(1, safeRound) - 1) / this.turnsPerTier) + 1;
    if (newTier !== this.unlockedTier) {
      this.unlockedTier = newTier;
      this.onTierUnlock?.(this.unlockedTier);
    }
    this._renderLocks();
  }

  /** Replace unit list at runtime (optional). */
  setUnits(units) {
    this.units = (units || [])
      .slice()
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
    this._rebuildRows();
    this._renderLocks();
  }

  /** Clean up listeners & objects (call on scene shutdown). */
  destroy() {
    this.scene.scale.off("resize", this._onResize);
    this.scene.game?.events?.off("turn:changed", this._onTurnChanged);
    [this.bg, this.title, this.list, ...this.rows.map(r => r.container)].forEach(o => o?.destroy());
    this.rows = [];
  }

  // ---------------- internals ----------------

  _currentRound() {
    if (this.scene.game?.turnManager?.round) return this.scene.game.turnManager.round;
    if (typeof this.scene.round === "number") return this.scene.round;
    return 1;
  }

  _onTurnChanged(payload) {
    this.applyRound(payload?.round ?? this._currentRound());
  }

  _onResize(size) {
    if (!size) return;
    this._layout(size.width, size.height);
  }

 _buildUI() {
  const { width, height } = this.scene.scale;

  this.bg = this.scene.add
    .rectangle(0, 0, this.panelWidth, height, 0x111522, 0.85)
    .setOrigin(0, 0)
    .setDepth(2000)       // higher than tiles/hud
    .setScrollFactor(0);

  this.title = this.scene.add
    .text(16, 12, "Units", {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "20px",
      color: "#ffffff",
    })
    .setDepth(2001)
    .setScrollFactor(0);

  this.list = this.scene.add
    .container(0, 40)
    .setDepth(2001)
    .setScrollFactor(0);

  this._rebuildRows();
  this._layout(width, height);
}

_layout(w, h) {
  // Always (re)position everything; don’t assume previous values.
  this.bg?.setSize(this.panelWidth, h);
  this.bg?.setPosition(0, 0);

  this.title?.setPosition(16, 12);
  this.list?.setPosition(0, 40);
}

_rebuildRows() {
  // nuke existing UI
  this.list.removeAll(true);
  this.rows = [];

  const pad = 12;
  const rowH = 60;
  const left = 16;
  let y = pad;

  for (const u of this.units) {
    const row = this.scene.add.container(0, y);

    // Build the tray first
    const tray = new UnitTray(
      this.scene,
      36,              // x (within the left panel)
      30,              // y (within the row)
      u.iconKey,       // texture key (matches your preloaded asset)
      "Player 1",      // owner label used by your UnitTray
      Unit,            // Unit class
      u.id             // unit id / name
    );

    // If UnitTray didn't produce a sprite (bad/missing icon), make a placeholder
    let traySprite = tray.sprite;
    if (!traySprite) {
      console.warn("[UnitProgression] Tray sprite missing for", u);
      traySprite = this.scene.add.rectangle(36, 30, 34, 34, 0x666666).setOrigin(0.5);
    }

    // Label
    const label = this.scene.add.text(
      left + 48,
      12,
      `${u.name}  (T${u.tier}) — ?`,
      {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: "16px",
        color: "#ffffff",
      }
    );

    // Update label once cost is fetched
    tray.onCostLoaded = (cost) => {
      label.setText(`${u.name}  (T${u.tier}) — ${cost ?? "?"}`);
    };

    // Lock overlay (DECLARE BEFORE USING in row.add)
    const lockOverlay = this.scene.add
      .rectangle(0, 0, this.panelWidth, rowH, 0x000000, 0.45)
      .setOrigin(0, 0)
      .setVisible(false);

    // Row underline
    const underline = this.scene.add
      .rectangle(0, rowH - 1, this.panelWidth, 1, 0x2a2f41)
      .setOrigin(0, 1);

    // Add to row in final order
    row.add([traySprite, label, lockOverlay, underline]);
    row.setPosition(0, y);
    row.setSize(this.panelWidth, rowH);
    this.list.add(row);

    // Track the row parts we need later
    this.rows.push({ unit: u, container: row, tray, label, lockOverlay, traySprite });

    y += rowH;
  }

  // Lay out and apply locks for the current round
  this._layout(this.scene.scale.width, this.scene.scale.height);
  this._renderLocks();
}

// --- make sure this method also exists (this is what _buildUI calls) ---
_layout(w, h) {
  this.bg?.setSize(this.panelWidth, h);
  this.bg?.setPosition(0, 0);
  this.list?.setPosition(0, 40);
}

  _renderLocks() {
    for (const row of this.rows) {
      const locked = row.unit.tier > this.unlockedTier;
      row.lockOverlay.setVisible(locked);

      if (row.tray?.sprite) {
        row.tray.sprite.disableInteractive();
        if (!locked) row.tray.sprite.setInteractive({ useHandCursor: true });
        row.tray.sprite.setAlpha(locked ? 0.35 : 1);
   }

    row.label.setAlpha(locked ? 0.6 : 1);
  }
}
  _safeIconKey(key) {
    // Make sure the texture exists; fall back to a known key you have loaded.
    if (key && this.scene.textures.exists(key)) return key;

    const fallbacks = [
      "warrior",
      "swordsman",
      "archer",
      "scout",
      "horseman",
      "knight",
      "slinger",
      "chariot",
      "lancer",
      "musketeer",
    ];
    for (const k of fallbacks) {
      if (this.scene.textures.exists(k)) return k;
    }
    // last resort: return Phaser’s missing texture key so the scene won’t crash
    return "__MISSING";
  }

  _fallbackRowGraphic(left) {
    // simple placeholder if a row can’t build
    const txt = this.scene.add.text(
      left,
      12,
      "Unavailable",
      {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: "16px",
        color: "#bbbbbb",
      }
    );
    return txt;
  }
}
