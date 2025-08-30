import Tile from "./lib/tile.js";
import Unit from "./lib/unit.js";

export class TutorialScene extends Phaser.Scene {
  constructor() {
    super("tutorial");

    this.Unit = Unit;
    this.tiles = new Map();
    this.units = [];
    this.selectedUnit = null;
    this.step = 0;
  }

  preload() {
    this.load.image("scout", "assets/scout.png");
    this.load.image("warrior", "assets/warrior.png");
    this.load.json("tutorialLevel", "assets/levels/tutorial.json");
  }

  create() {
    const levelData = this.cache.json.get("tutorialLevel");

    const radius = 30;
    const hexWidth = Math.sqrt(3) * radius;
    const hexHeight = 2 * radius;

    const offsetX = (this.scale.width - hexWidth * levelData.cols) / 2;
    const offsetY = (this.scale.height - hexHeight * 0.75 * levelData.rows) / 2;

    // Draw tiles
    for (const tileData of levelData.tiles) {
      const { q, r, color } = tileData;
      const tile = new Tile(this, q, r, offsetX, offsetY, parseInt(color));
      this.tiles.set(`${q},${r}`, tile);
    }

    // Add one friendly and one enemy unit
    this.playerUnit = new this.Unit(this, 0, 0, "warrior", "Player 1");
    this.enemyUnit = new this.Unit(this, 2, 1, "scout", "AI 1");

    this.units.push(this.playerUnit, this.enemyUnit);

    this.units.forEach((unit) => {
      unit.sprite.setInteractive();
      unit.sprite.on("pointerdown", () => this.handleUnitClick(unit));
    });

    this.addStepText();

    this.input.keyboard.on("keydown-SPACE", () => this.advanceStep());

    this.createBackButton();
  }

  addStepText() {
    this.stepText = this.add.text(50, 50, "", {
      fontSize: "20px",
      color: "#ffffff",
      backgroundColor: "#00000088",
      padding: { x: 10, y: 8 },
      wordWrap: { width: 500 },
    });
    this.updateStepText();
  }

  updateStepText() {
    const messages = [
      "Welcome to the tutorial! Press [Space] to begin.",
      "This is your unit (blue). Click on it to select it.",
      "This is an enemy unit (red). Try clicking on it while your unit is selected.",
      "Great! That was combat. Press [Space] to finish the tutorial.",
      "Tutorial complete! Press [Back] to return to level select.",
    ];

    this.stepText.setText(messages[this.step] || "End of tutorial.");
  }

  advanceStep() {
    this.step += 1;
    this.updateStepText();

    // Optionally do actions at each step
    if (this.step === 2) {
      this.highlightUnit(this.enemyUnit);
    }

    if (this.step === 3) {
      this.clearHighlights();
    }
  }

  highlightUnit(unit) {
    unit.sprite.setTint(0xff0000);
  }

  clearHighlights() {
    this.units.forEach((u) => u.sprite.clearTint());
  }

  handleUnitClick(unit) {
    if (this.step === 1 && unit.owner === "Player 1") {
      this.selectedUnit = unit;
      this.advanceStep();
    } else if (this.step === 2 && this.selectedUnit && unit.owner !== "Player 1") {
      this.simulateCombat(this.selectedUnit, unit);
      this.advanceStep();
    }
  }

  simulateCombat(attacker, defender) {
    defender.sprite.setAlpha(0.3); // Fake "death"
  }

  createBackButton() {
    const backBtn = this.add
      .text(this.scale.width - 80, this.scale.height - 40, "← Back", {
        fontSize: "18px",
        backgroundColor: "#444444",
        color: "#ffffff",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive();

    backBtn.on("pointerdown", () => {
      this.scene.start("level_select");
    });

    this.scale.on("resize", (size) => {
      backBtn.setPosition(size.width - 80, size.height - 40);
    });
  }
}