import Tile from "./lib/tile.js";
import Unit from "./lib/unit.js";
import EnemyAI from "./lib/enemyAI.js";
import UnitProgression from "./UnitProgression.js";
import { supabase } from "./supabaseClient.js";
import unitTray from "./lib/unitTray.js";

// Helper: fetch the catalog from Supabase (falls back to local list if needed)
function fetchUnitsFromSupabase() {
  return supabase
    .from("units_data")
    .select("name,tier")
    .order("tier")
    .order("name")
    .then(({ data, error }) => {
      if (error) {
        console.error("supabase units_data error:", error);
        return [];
      }
      return (data || []).map((u) => ({
        id: u.name,
        name: u.name.charAt(0).toUpperCase() + u.name.slice(1),
        tier: u.tier ?? 1,
        iconKey: u.name,
      }));
    })
    .catch((e) => {
      console.error("fetchUnitsFromSupabase error:", e);
      return [];
    });
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super("game");

    this.Unit = Unit;

    this.players = ["Player 1"];
    this.turnIndex = 0;
    this.round = 1;

    this.AIs = [];

    this.turnText = null;
    this.endTurnBtn = null;
    this.goldText = null;

    this.tiles = new Map();
    this.units = [];

    this.highlightedTiles = [];

    // combat
    this.selectedUnit = null;
    this.targetUnit = null;
    this._playerGold = 100;
  }

  init(data) {
    this.level = data.level;

    // Reset scene-level state
    this.players = ["Player 1"];
    this.turnIndex = 0;
    this.round = 1;
    this.AIs = [];
    this.tiles = new Map();
    this.units = [];
    this.highlightedTiles = [];
    this.selectedUnit = null;
    this.targetUnit = null;
    this._playerGold = 100;
    this.turnText = null;
    this.endTurnBtn = null;
    this.goldText = null;
  }

  get playerGold() {
    return this._playerGold;
  }

  set playerGold(value) {
    this._playerGold = value;

    if (this.goldText) {
      this.goldText.setText(`Gold: ${this._playerGold}`);
    }
    if (this.unitUI) {
      this.unitUI.updateTrayAffordability(this._playerGold);
    }
  }

  preload() {
    this.load.json("level1", "assets/levels/level1.json");
    this.load.json("level2", "assets/levels/level2.json");
    this.load.json("level3", "assets/levels/level3.json");

    // icons used by the UnitProgression sidebar
    this.load.image("scout", "assets/scout.png");
    this.load.image("warrior", "assets/warrior.png");
    this.load.image("knight", "assets/knight.png");
    this.load.image("lancer", "assets/lancer.png");
    this.load.image("slinger", "assets/slinger.png");
    this.load.image("archer", "assets/archer.png");
    this.load.image("swordsman", "assets/swordsman.png");
    this.load.image("horseman", "assets/horseman.png");
    this.load.image("chariot", "assets/chariot.png");
    this.load.image("musketeer", "assets/musketeer.png");
  }

  async create() {
    const levelData = this.cache.json.get(this.level);

    // ====== PLAYERS (clear + insert) via Supabase ======
    await supabase.from("players").delete().neq("id", 0);
    for (let i = 1; i < levelData.num_enemies + 1; i++) {
      const aiName = "AI " + i;
      this.players.push(aiName);
      this.AIs.push(new EnemyAI(this, aiName));
    }
    await supabase.from("players").insert(this.players.map((name) => ({ name })));

    // ===== UNIT PROGRESSION HUD (LEFT PANEL) =====
    const unitCatalog = await fetchUnitsFromSupabase();
    const fallbackUnits = [
      { id: "warrior", name: "Warrior", tier: 1, iconKey: "warrior" },
      { id: "slinger", name: "Slinger", tier: 1, iconKey: "slinger" },
      { id: "scout", name: "Scout", tier: 1, iconKey: "scout" },
      { id: "archer", name: "Archer", tier: 2, iconKey: "archer" },
      { id: "swordsman", name: "Swordsman", tier: 2, iconKey: "swordsman" },
      { id: "horseman", name: "Horseman", tier: 2, iconKey: "horseman" },
      { id: "knight", name: "Knight", tier: 3, iconKey: "knight" },
      { id: "chariot", name: "Chariot", tier: 3, iconKey: "chariot" },
      { id: "lancer", name: "Lancer", tier: 3, iconKey: "lancer" },
      { id: "musketeer", name: "Musketeer", tier: 4, iconKey: "musketeer" },
    ];

    this.unitUI = new UnitProgression(this, {
      units: unitCatalog.length ? unitCatalog : fallbackUnits,
      turnsPerTier: 5,
      onTierUnlock: (tier) => console.log(`Unlocked Tier ${tier}`),
    });

    // ===== GRID =====
    const radius = 30;
    const hexWidth = Math.sqrt(3) * radius;
    const hexHeight = 2 * radius;

    const cols = levelData.cols;
    const rows = levelData.rows;

    const gridPixelWidth = hexWidth * cols + hexWidth / 2;
    const gridPixelHeight = hexHeight * 0.75 * rows + hexHeight / 4;

    const offsetX = (this.scale.width - gridPixelWidth) / 2;
    const offsetY = (this.scale.height - gridPixelHeight) / 2;

    const playerColors = {
      "Player 1": 0x3377cc,
      "AI 1": 0xd2042d,
      "AI 2": 0xcc3333,
    };

    for (const tileData of levelData.tiles) {
      const { q, r, color } = tileData;
      const tileColor = parseInt(color);
      const tile = new Tile(this, q, r, offsetX, offsetY, tileColor);

      for (const [playerName, playerColor] of Object.entries(playerColors)) {
        if (tileColor === playerColor) {
          tile.setOwner(playerName);
          break;
        }
      }

      this.tiles.set(`${q},${r}`, tile);

      const dz = this.add
        .zone(tile.x, tile.y, hexWidth * 0.9, hexHeight * 0.9)
        .setRectangleDropZone(hexWidth * 0.9, hexHeight * 0.9);
      dz.setData("tileObj", tile);
    }

    this.input.setTopOnly(true);

    // ===== HUD =====
    this.createTurnHud();

    // Load persisted state, then sync unlocks and HUD
    await this.loadTurnState(this.level);
    await this.loadTiles(this.level);
    this.unitUI.applyRound(this.round);
    this.renderTurnHud();

    // Units
    await this.loadUnitDataFromDB();

    // Input
    this.input.keyboard.on("keydown-SPACE", () => this.advanceTurn());

    this.scale.on("resize", (size) => {
      const x = size.width - 260;
      if (this.turnText) this.turnText.setPosition(x, 20);
      if (this.endTurnBtn) this.endTurnBtn.setPosition(x, 92);
      if (this.goldText) this.goldText.setPosition(x, 160);
    });

    this.input.on("gameobjectdown", async (_pointer, obj) => {
      if (obj.unitId) {
        const unit = this.units.find((u) => u.id === obj.unitId);
        if (unit) this.onUnitClick(unit);
      }
    });

    this.selectedUnit = null;

    this.units.forEach((unit) => {
      unit.sprite.setInteractive();
      unit.sprite.on("pointerdown", () => {
        if (!this.selectedUnit) {
          if (unit.owner === "Player 1") {
            this.selectedUnit = unit;
          }
          return;
        }
        if (this.selectedUnit && unit.owner !== this.selectedUnit.owner) {
          this.combat(this.selectedUnit.id, unit.id);
          this.selectedUnit = null;
        }
      });
    });

    this.createResetButton();
    this.createBackButton();
    this.createSaveLoadButtons();
  }

  shutdown() {
    this.unitUI?.destroy();
  }

  clearHighlightedTiles() {
    this.highlightedTiles.forEach((tile) => tile.setColor(tile.baseColor));
    this.highlightedTiles = [];
  }

  currentPlayer() {
    return this.players[this.turnIndex];
  }

  nextPlayer() {
    return this.players[(this.turnIndex + 1) % this.players.length];
  }

  checkWinLose() {
    const allTiles = Array.from(this.tiles.values());
    const allPlayer = allTiles.filter((t) => t.owner === "Player 1").length;
    const allEnemy = allTiles.filter((t) => t.owner && t.owner.startsWith("AI")).length;

    if (allEnemy === 0) this.showEndScreen("win");
    else if (allPlayer === 0) this.showEndScreen("lose");
  }

  async advanceTurn() {
    const current = this.currentPlayer();

    if (current === "Player 1") {
      // refresh movement
      this.units.forEach((u) => {
        if (u.owner === current) u.incrementTurn();
      });

      // gold income
      const ownedTileCount = Array.from(this.tiles.values()).filter(
        (t) => t.owner === current,
      ).length;
      this.playerGold += ownedTileCount * 5;

      // AIs act
      for (const ai of this.AIs) {
        ai.newTurn();
        ai.takeTurn();
      }

      // round advance + unlocks
      this.round += 1;
      this.turnIndex = 0;
      this.unitUI.applyRound(this.round);
    }

    this.game.events.emit("turn:changed", { round: this.round });

    this.renderTurnHud();
    this.checkWinLose();

    // persist
    await this.saveTurnState(this.level);
    await this.saveTiles(this.level);
  }

  createResetButton() {
    const btn = this.add
      .text(this.scale.width - 80, this.scale.height - 160, "🗑 Reset", {
        fontSize: "16px",
        backgroundColor: "#882222",
        color: "#ffffff",
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setInteractive();

    btn.on("pointerdown", async () => {
      const level = this.level;
      await supabase.from("tiles_state").delete().eq("level", level);
      await supabase.from("turn_state").delete().eq("level", level);
      await supabase.from("units_state").delete();           // optional
      await supabase.from("players").delete().neq("id", 0);  // optional

      // Reset local state
      this.round = 1;
      this.turnIndex = 0;
      this.playerGold = 100;

      // Repaint tiles from level JSON
      const levelData = this.cache.json.get(this.level);
      for (const t of levelData.tiles) {
        const key = `${t.q},${t.r}`;
        const tile = this.tiles.get(key);
        if (tile) {
          tile.setColor(parseInt(t.color));
          tile.setOwner(null);
        }
      }

      this.unitUI.applyRound?.(this.round);
      this.renderTurnHud();
      console.log("Reset complete.");
    });

    this.scale.on("resize", (size) =>
      btn.setPosition(size.width - 80, size.height - 160),
    );
  }

  createBackButton() {
    const backBtn = this.add
      .text(this.scale.width - 80, this.scale.height - 40, "← Back", {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: "18px",
        color: "#ffffff",
        backgroundColor: "#444444",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    backBtn.on("pointerdown", () => {
      this.units.forEach((u) => u.sprite?.destroy());
      this.units = [];
      this.unitUI?.destroy();
      this.scene.start("level_select");
    });

    this.scale.on("resize", (size) => {
      backBtn.setPosition(80, size.height - 40);
    });
  }

  createSaveLoadButtons() {
    const x = this.scale.width - 80;
    const yStart = this.scale.height - 120;

    const saveBtn = this.add
      .text(x, yStart, "💾 Save", {
        fontSize: "16px",
        backgroundColor: "#006600",
        color: "#ffffff",
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setInteractive();

    const loadBtn = this.add
      .text(x, yStart + 40, "📂 Load", {
        fontSize: "16px",
        backgroundColor: "#004488",
        color: "#ffffff",
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setInteractive();

    saveBtn.on("pointerdown", () => {
      const level = this.level;
      this.saveTurnState(level);
      this.saveTiles(level);
    });

    loadBtn.on("pointerdown", async () => {
      const level = this.level;
      await this.loadTurnState(level);
      await this.loadTiles(level);
      await this.loadUnitDataFromDB();
      this.unitUI.applyRound(this.round); // keep unlocks in sync after load
      this.renderTurnHud();
    });

    saveBtn.on("pointerover", () => {
      saveBtn.setTint(0xaaaaaa);
      saveBtn.scene.input.setDefaultCursor("pointer");
    });
    saveBtn.on("pointerout", () => {
      saveBtn.clearTint();
      saveBtn.scene.input.setDefaultCursor("default");
    });

    loadBtn.on("pointerover", () => {
      loadBtn.setTint(0xaaaaaa);
      loadBtn.scene.input.setDefaultCursor("pointer");
    });
    loadBtn.on("pointerout", () => {
      loadBtn.clearTint();
      loadBtn.scene.input.setDefaultCursor("default");
    });

    this.scale.on("resize", (size) => {
      saveBtn.setPosition(size.width - 80, size.height - 120);
      loadBtn.setPosition(size.width - 80, size.height - 80);
    });
  }

  createTurnHud() {
    const x = this.scale.width - 260;

    this.turnText = this.add.text(x, 20, "", {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "20px",
      color: "#ffffff",
      backgroundColor: "#262c44",
      padding: { x: 12, y: 8 },
      align: "left",
    });

    this.endTurnBtn = this.add
      .text(x, 92, "End Turn (Space)", {
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: "16px",
        color: "#ffffff",
        backgroundColor: "#2370aa",
        padding: { x: 12, y: 8 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.advanceTurn());

    this.goldText = this.add.text(x, 160, "", {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: "16px",
      color: "#ffd700",
      backgroundColor: "#444",
      padding: { x: 12, y: 8 },
    });
  }

  showEndScreen(result) {
    this.input.keyboard.removeAllListeners();
    this.unitUI?.destroy();
    // (no UnitTray anymore)

    const overlay = this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      this.scale.width,
      this.scale.height,
      0x000000,
      0.6,
    );
    overlay.setDepth(100);

    const text = this.add
      .text(
        this.scale.width / 2,
        this.scale.height / 2 - 50,
        result === "win" ? "YOU WIN!" : "YOU LOSE!",
        {
          fontSize: "64px",
          fontStyle: "bold",
          color: result === "win" ? "#00ff00" : "#ff0000",
        },
      )
      .setOrigin(0.5)
      .setDepth(101);

    const button = this.add
      .text(
        this.scale.width / 2,
        this.scale.height / 2 + 50,
        "Back to Level Select",
        {
          fontSize: "32px",
          color: "#ffffff",
          backgroundColor: "#333333",
          padding: { x: 20, y: 10 },
        },
      )
      .setOrigin(0.5)
      .setInteractive()
      .setDepth(101);

    button.on("pointerdown", () => {
      this.scene.start("level_select");
    });
  }

  renderTurnHud() {
    this.turnText.setText(`Round: ${this.round}`);
    this.goldText.setText(`Gold: ${this.playerGold}`);
  }

  // ===== Supabase-backed loads =====
  async loadUnitDataFromDB() {
    try {
      const { data, error } = await supabase
        .from("units_state")
        .select("id, unit_type, current_health, owned_by, q_pos, r_pos, moves_left");
      if (error) throw error;

      // clear existing
      this.units.forEach((u) => u.sprite.destroy());
      this.units = [];

      for (const row of data) {
        const unit = new this.Unit(this, row.q_pos, row.r_pos, row.unit_type, row.owned_by);
        unit.id_num = row.id;
        unit.id = row.unit_type;
        unit.sprite.unitId = row.id;
        unit.movesLeft = row.moves_left ?? 1;

        const tile = this.tiles.get(`${row.q_pos},${row.r_pos}`);
        if (tile) {
          tile.unit = unit;
          unit.boundTile = tile;
          unit.sprite.x = tile.x;
          unit.sprite.y = tile.y;
          unit.startX = tile.x;
          unit.startY = tile.y;
        }

        unit.sprite.setInteractive();
        unit.sprite.on("pointerdown", () => {
          if (!this.selectedUnit) {
            if (unit.owner === "Player 1") this.selectedUnit = unit;
            return;
          }
          if (this.selectedUnit && unit.owner !== this.selectedUnit.owner) {
            this.combat(this.selectedUnit.id, unit.id_num);
            this.selectedUnit = null;
          }
        });

        if (unit.movesLeft <= 0) unit.sprite.setTint(0x888888);
        this.units.push(unit);
      }
    } catch (error) {
      console.error("Error loading units from Supabase:", error);
    }
  }

  // (still local endpoints; migrate later if needed)
  async checkUnitRange(attackerId, victimId) {
    try {
      const res = await fetch(`/detect_units?attackId=${attackerId}&enemyId=${victimId}`);
      return await res.json();
    } catch (error) {
      console.error("Error checking range:", error);
      return false;
    }
  }

  async onUnitClick(unit) {
    if (!this.selectedUnit) {
      if (unit.owner !== this.currentPlayer()) return;
      this.selectedUnit = unit;
    } else {
      if (unit.owner === this.currentPlayer()) return;
      this.targetUnit = unit;

      const inRange = await this.checkUnitRange(this.selectedUnit.id, this.targetUnit.id);
      if (inRange) await this.combat(this.selectedUnit.id, this.targetUnit.id);
      this.selectedUnit = null;
      this.targetUnit = null;
    }
  }

  async combat(attackerId, victimId) {
    try {
      let res = await fetch(`/combat?attackerId=${attackerId}&victimId=${victimId}`);
      let data = await res.json();

      if (data.error) {
        console.error("Error:", data.error);
        return;
      }

      if (data.victimUpdated && data.victimUpdated.current_health > 0) {
        let victimUnit = this.units.find((u) => u.id === victimId);
        if (victimUnit) {
          console.log(`Victim ${victimId} now has ${data.victimUpdated.current_health} HP`);
        }
      }

      if (data.victimDefeated) {
        let victimIndex = this.units.findIndex((u) => u.id === victimId);
        if (victimIndex !== -1) {
          this.units[victimIndex].sprite.destroy();
          this.units.splice(victimIndex, 1);
        }
      }
    } catch (error) {
      console.error("Error, combat request failed:", error);
    }
  }

  // ===== Supabase persistence for round/tiles =====
  saveTurnState(level) {
    return supabase
      .from("turn_state")
      .upsert({
        level,
        round: this.round,
        turn: this.turnIndex,
        gold: this.playerGold,
        updated_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) console.error("saveTurnState error", error);
        else console.log("Turn state saved!");
      });
  }

  async loadTurnState(level) {
    const { data, error } = await supabase
      .from("turn_state")
      .select("round, turn, gold")
      .eq("level", level)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("loadTurnState error", error);
      return;
    }

    if (data) {
      this.round = data.round;
      this.turnIndex = data.turn;
      this.playerGold = data.gold;
    } else {
      await supabase.from("turn_state").insert({ level, round: 1, turn: 0, gold: this.playerGold });
    }
  }

  saveTiles(level) {
    const rows = Array.from(this.tiles.values()).map((t) => ({
      level,
      q: t.q,
      r: t.r,
      color: t.baseColor,
      owner: t.owner || null,
      updated_at: new Date().toISOString(),
    }));

    supabase
      .from("tiles_state")
      .upsert(rows, { onConflict: "level,q,r" })
      .then(({ error }) => {
        if (error) console.error("saveTiles error", error);
        else console.log("Tiles saved!");
      });
  }

  async loadTiles(level) {
    const { data, error } = await supabase
      .from("tiles_state")
      .select("q, r, color, owner")
      .eq("level", level);

    if (error) {
      console.error("loadTiles error", error);
      return;
    }

    for (const row of data) {
      const key = `${row.q},${row.r}`;
      const tile = this.tiles.get(key);
      if (!tile) continue;
      tile.setColor(Number(row.color));
      tile.setOwner(row.owner || null);
    }
    console.log("Tiles loaded.");
  }
}

