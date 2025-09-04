import Tile from "./lib/tile.js";
import UnitTray from "./lib/unitTray.js";
import Unit from "./lib/unit.js";
import EnemyAI from "./lib/enemyAI.js";
import UnitProgression from "./UnitProgression.js";

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

    // Reset players and units_state table
    await fetch("/clear_table?name=players");
    await fetch("/clear_table?name=units_state");

    for (let i = 1; i < levelData.num_enemies + 1; i++) {
      const aiName = "AI " + i;
      this.players.push(aiName);

      this.AIs.push(new EnemyAI(this, aiName));
    }

    for (let player_name of this.players) {
      await fetch("/add_player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player: player_name }),
      });
    }

    // ===== UNIT PROGRESSION HUD (LEFT PANEL) =====
    // Tiers are easy to tweak; icons use your existing PNGs in /assets
    const units = [
      // Tier 1
      { id: "warrior", name: "Warrior", tier: 1, iconKey: "warrior" },
      { id: "slinger", name: "Slinger", tier: 1, iconKey: "slinger" },
      { id: "scout", name: "Scout", tier: 1, iconKey: "scout" },

      // Tier 2
      { id: "archer", name: "Archer", tier: 2, iconKey: "archer" },
      { id: "swordsman", name: "Swordsman", tier: 2, iconKey: "swordsman" },
      { id: "horseman", name: "Horseman", tier: 2, iconKey: "horseman" },

      // Tier 3
      { id: "knight", name: "Knight", tier: 3, iconKey: "knight" },
      { id: "chariot", name: "Chariot", tier: 3, iconKey: "chariot" },
      { id: "lancer", name: "Lancer", tier: 3, iconKey: "lancer" },

      // Tier 4
      { id: "musketeer", name: "Musketeer", tier: 4, iconKey: "musketeer" },
    ];

    this.unitUI = new UnitProgression(this, {
      units,
      turnsPerTier: 5, // unlock next tier every 5 rounds
      onTierUnlock: (tier) => {
        // optional: toast/SFX/etc.
        console.log(`Unlocked Tier ${tier}`);
      },
    });

    // If you don’t have a global TurnManager emitting "turn:changed",
    // call this when your round changes:
    // this.unitUI.applyRound(this.round);

    // Keep panel sized on resize (UnitProgression also listens, but safe)
    this.scale.on("resize", (size) => {
      // nothing else required; UnitProgression re-lays out on resize
    });

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

    // HUD
    this.createTurnHud();
    this.renderTurnHud();

    await this.loadUnitDataFromDB();

    this.input.keyboard.on("keydown-SPACE", () => this.advanceTurn());

    this.scale.on("resize", (size) => {
      const x = size.width - 260;
      if (this.turnText) this.turnText.setPosition(x, 20);
      if (this.endTurnBtn) this.endTurnBtn.setPosition(x, 92);
      if (this.goldText) this.goldText.setPosition(x, 160);
    });

    this.input.on("gameobjectdown", async (_pointer, obj) => {
      if (obj.unitId) {
        const unit = this.units.find((unit) => unit.id === obj.unitId);
        if (unit) {
          this.onUnitClick(unit);
        }
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

    const allPlayer = allTiles.filter(
      (tile) => tile.owner === "Player 1",
    ).length;
    const allEnemy = allTiles.filter(
      (tile) => tile.owner && tile.owner.startsWith("AI"),
    ).length;

    if (allEnemy === 0) {
      this.showEndScreen("win");
    } else if (allPlayer === 0) {
      this.showEndScreen("lose");
    }
  }

  async advanceTurn() {
    const current = this.currentPlayer();

    if (current === "Player 1") {
      this.units.forEach((unit) => {
        if (unit.owner === current) unit.incrementTurn();
      });

      const ownedTileCount = Array.from(this.tiles.values()).filter(
        (tile) => tile.owner === current,
      ).length;
      const goldGained = ownedTileCount * 5;
      this.playerGold += goldGained;

      await fetch("/set_gold", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: current, gold: this.playerGold }),
      });

      for (const ai of this.AIs) {
        ai.newTurn();
        ai.takeTurn();
      }

      this.round += 1;
      this.turnIndex = 0;
    }

    this.game.events.emit("turn:changed", { round: this.round });

    this.renderTurnHud();
    this.checkWinLose();
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
      // Clean up units and UI
      this.units.forEach((unit) => unit.sprite?.destroy());
      this.units = [];

      this.unitUI?.destroy();

      // Return to Level Select
      this.scene.start("level_select");
    });

    // Keep it responsive on resize
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
      this.saveTable(level, "players");
      this.saveTable(level, "units_state");
      this.saveTurnState(level);
      this.saveTiles(level);
    });

    loadBtn.on("pointerdown", async () => {
      const level = this.level;

      await this.importTable(level, "players");
      await this.importTable(level, "units_state");
      await this.loadTurnState(level);
      await this.loadTiles(level);
      await this.loadUnitDataFromDB();
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
    this.unitTray?.destroy();

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

  async renderTurnHud() {
    const current = this.currentPlayer();
    const next = this.nextPlayer();
    await fetch(`/get_gold?player=${encodeURIComponent("Player 1")}`)
      .then(async (res) => await res.json())
      .then((data) => {
        this.playerGold = data.gold;
      });

    this.turnText.setText(`Round: ${this.round}`);
    // this.goldText.setText(`Gold: ${this.playerGold}`);
  }

  async loadUnitDataFromDB() {
    try {
      const res = await fetch(`/get_all_units`);
      const unitsData = await res.json();

      // Clear any existing units first
      this.units.forEach((unit) => unit.sprite.destroy());
      this.units = [];

      for (let unitData of unitsData) {
        const unit = new this.Unit(
          this,
          unitData.q_pos,
          unitData.r_pos,
          unitData.unit_type,
          unitData.owned_by,
        );
        unit.id_num = unitData.id;
        unit.id = unitData.unit_type;
        unit.sprite.unitId = unitData.id;
        unit.movesLeft = unitData.moves_left;

        const tile = this.tiles.get(`${unit.q_pos},${unit.r_pos}`);
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
            if (unit.owner === "Player 1") {
              this.selectedUnit = unit;
            }
            return;
          }
          if (this.selectedUnit && unit.owner !== this.selectedUnit.owner) {
            this.combat(this.selectedUnit.id, unit.id_num);
            this.selectedUnit = null;
          }
        });
        if (unit.movesLeft <= 0) {
          unit.sprite.setTint(0x888888);
        }
        this.units.push(unit);
      }
    } catch (error) {
      console.error("Error loading units from Database:", error);
    }
  }

  async checkUnitRange(attackerId, victimId) {
    try {
      const res = await fetch(
        `/detect_units?attackId=${attackerId}&enemyId=${victimId}`,
      );
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

      const inRange = await this.checkUnitRange(
        this.selectedUnit.id,
        this.targetUnit.id,
      );
      if (inRange) {
        await this.combat(this.selectedUnit.id, this.targetUnit.id);
      }
      this.selectedUnit = null;
      this.targetUnit = null;
    }
  }

  async combat(attackerId, victimId) {
    try {
      let res = await fetch(
        `/combat?attackerId=${attackerId}&victimId=${victimId}`,
      );
      let data = await res.json();

      if (data.error) {
        console.error("Error:", data.error);
        return;
      }

      if (data.victimUpdated && data.victimUpdated.current_health > 0) {
        let victimUnit = this.units.find((unit) => unit.id === victimId);
        if (victimUnit) {
          console.log(
            `Victim ${victimId} now has ${data.victimUpdated.current_health} HP`,
          );
        }
      }

      if (data.victimDefeated) {
        let victimIndex = this.units.findIndex((unit) => unit.id === victimId);
        if (victimIndex !== -1) {
          this.units[victimIndex].sprite.destroy();
          this.units.splice(victimIndex, 1);
        }
      }
    } catch (error) {
      console.error("Error, combat request failed:", error);
    }
  }

  // get level from this.level (set in init(data))
  // table: name of table (string)

  saveTable(level, table) {
    fetch("/export_table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, table }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          console.log(`Table saved to temp folder: ${result.path}`);
        }
      });
  }

  async importTable(level, table) {
    try {
      const res = await fetch("/import_table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, table }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      console.log(result.message);
    } catch (err) {
      console.error("Failed to import table:", err);
    }
  }

  saveTurnState(level) {
    fetch("/save_turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level,
        turn: this.turnIndex,
        round: this.round,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          console.log("Turn state saved!");
        } else {
          console.error("Failed to save turn state:", result.error);
        }
      });
  }

  loadTurnState(level) {
    return fetch(`/load_turn?level=${level}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          this.turnIndex = data.turn;
          this.round = data.round;
          this.renderTurnHud(); // ✅ Call it here always
          console.log("Turn state loaded.");
        } else {
          console.error("Failed to load turn state:", data.error);
        }
      });
  }

  saveTiles(level) {
    const tilesData = Array.from(this.tiles.values()).map((tile) => ({
      q: tile.q,
      r: tile.r,
      color: tile.baseColor,
      owner: tile.owner || null,
    }));

    fetch("/save_tiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, tiles: tilesData }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.success) {
          console.log("Tiles saved!");
        } else {
          console.error("Failed to save tiles:", result.error);
        }
      });
  }

  loadTiles(level) {
    fetch(`/load_tiles?level=${level}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const playerColors = {
            "Player 1": 0x3377cc,
            "AI 1": 0xd2042d,
            "AI 2": 0xcc3333,
          };

          for (const tileData of data.tiles) {
            const key = `${tileData.q},${tileData.r}`;
            const tile = this.tiles.get(key);
            if (tile) {
              tile.setColor(parseInt(tileData.color));
              tile.setOwner(tileData.owner || null);
            }
          }

          console.log("Tiles loaded.");
        } else {
          console.error("Failed to load tiles:", data.error);
        }
      });
  }
}
