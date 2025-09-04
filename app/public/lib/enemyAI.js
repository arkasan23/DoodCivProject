import Unit from "./unit.js";

export default class EnemyAI {
  constructor(scene, name = "Enemy AI") {
    this.scene = scene;
    this.name = name;
    this.units = [];
    this.gold = 125;

    this.buyableUnits = ["warrior", "scout", "slinger"];
    this.currentTeir = 1;
    this.turnCounter = 0;

    if (this.scene.game?.events) {
      this.scene.game.events.on("turn:changed", this.turnChanged, this);
    }
  }

  turnChanged(turnNumber) {
    this.turnCounter++;

    if (this.turnCounter % 5 === 0) {
      this.currentTeir++;
      if (this.currentTeir === 2) {
        this.buyableUnits.push("archer", "horseman", "swordsman");
        console.log(this.buyableUnits);
      } else if (this.currentTeir === 3) {
        this.buyableUnits.push("chariot", "knight", "lancer");
      } else if (this.currentTeir === 4) {
        this.buyableUnits.push("musketeer");
      }
    }
  }

  getUnitsOfCurrentTier() {
    switch (this.currentTeir) {
      case 1:
        return ["warrior", "scout", "slinger"];
      case 2:
        return ["archer", "horseman", "swordsman"];
      case 3:
        return ["chariot", "knight", "lancer"];
      case 4:
        return ["musketeer"];
      default:
        return [];
    }
  }

  addUnit(unit) {
    this.units.push(unit);
    unit.owner = this.name;
  }

  newTurn() {
    this.units.forEach((u) => u.incrementTurn());
    const ownedTileCount = Array.from(this.scene.tiles.values()).filter(
      (t) => t.owner === this.name,
    ).length;
    this.gold += ownedTileCount * 7;
    console.log(`${this.name} has ${this.gold} gold`);
  }

  async takeTurn() {
    await this.tryToBuyUnits();

    for (const unit of this.units) {
      if (unit.currentHealth <= 0) continue;

      let moveLimt = 8;

      while (unit.movesLeft > 0 && moveLimt > 0) {
        const enemiesInRange = this.getEnemyUnitsInRange(unit);
        if (enemiesInRange.length > 0) {
          const target = this.chooseAttackTarget(enemiesInRange);
          console.log(`${this.name} attacks ${target.id}`);
          unit.attack(target);
          unit.movesLeft = 0;
          break;
        }

        const enemyTile = this.findNearestEnemyTile(unit);
        if (enemyTile) {
          console.log("moved towards enemy tile");
          this.advanceToward(unit, enemyTile);
          moveLimt--;
          continue;
        }
        // claim neutral tile
        const neutralTile = this.findNearestNeutralTile(unit);
        if (neutralTile) {
          console.log("move to neutralTile");
          this.moveAndClaim(unit, neutralTile);
          moveLimt--;
          continue;
        }

        this.wander(unit);
        moveLimt--;
      }
    }
  }

  async tryToBuyUnits() {
    const currentTierUnits = this.getUnitsOfCurrentTier();
    const allUnits = [
      ...currentTierUnits,
      ...this.buyableUnits.filter((u) => !currentTierUnits.includes(u)),
    ];

    let boughtUnit = true;

    while (boughtUnit) {
      boughtUnit = false;

      for (const unitType of allUnits) {
        try {
          const response = await fetch(`/get_unit?unitName=${unitType}`);
          const data = await response.json();
          const unitCost = data.cost;

          if (this.gold < unitCost) continue;

          const ownedTiles = Array.from(this.scene.tiles.values()).filter(
            (t) => t.owner === this.name && !t.unit,
          );

          if (ownedTiles.length === 0) return;

          const spawnTile = Phaser.Utils.Array.GetRandom(ownedTiles);
          const newUnit = new Unit(
            this.scene,
            spawnTile.q,
            spawnTile.r,
            unitType,
            this.name,
            unitType,
          );

          spawnTile.unit = newUnit;
          newUnit.boundTile = spawnTile;
          newUnit.moveToTile(spawnTile);
          newUnit.movesLeft = 0;

          this.addUnit(newUnit);
          this.scene.units.push(newUnit);

          this.gold -= unitCost;
          console.log(
            `${this.name} bought a ${unitType} on (${spawnTile.q},${spawnTile.r}) for ${unitCost} gold`,
          );

          boughtUnit = true;
          break; // try buying another unit from start of array
        } catch (err) {
          console.error("Failed to fetch unit cost:", err);
        }
      }
    }

    console.log(
      `${this.name} has ${this.gold} gold remaining after buying units.`,
    );
  }

  moveAndClaim(unit, tile) {
    if (!tile) return;
    unit.moveToTile(tile);
    tile.unit = unit;
    tile.setOwner(this.name);
    unit.boundTile = tile;
    unit.movesLeft--;
  }

  wander(unit) {
    const reachable = unit.getReachableTiles(this.scene.tiles);
    const valid = reachable.filter((t) => !t.unit);
    if (valid.length > 0) {
      const randTile = Phaser.Utils.Array.GetRandom(valid);
      this.moveAndClaim(unit, randTile);
    }
  }

  advanceToward(unit, targetTile) {
    console.log("move");

    const reachable = unit.getReachableTiles(this.scene.tiles);
    if (reachable.length === 0) return;

    let bestTile = null;
    let minDist = Infinity;

    for (const tile of reachable) {
      if (tile.unit) continue;
      const dx = targetTile.q - tile.q;
      const dy = targetTile.r - tile.r;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        bestTile = tile;
      }
    }

    if (bestTile) this.moveAndClaim(unit, bestTile);
  }

  findNearestEnemyTile(unit) {
    let minDist = Infinity;
    let nearest = null;
    for (const other of this.scene.units) {
      if (other.owner === this.name || other.currentHealth <= 0) continue;
      if (!other.boundTile) continue;
      const dx = other.boundTile.q - unit.q;
      const dy = other.boundTile.r - unit.r;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        nearest = other.boundTile;
      }
    }
    return nearest;
  }

  findNearestNeutralTile(unit) {
    let minDist = Infinity;
    let nearest = null;
    this.scene.tiles.forEach((tile) => {
      if (!tile.owner && !tile.unit) {
        const dx = tile.q - unit.q;
        const dy = tile.r - unit.r;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          nearest = tile;
        }
      }
    });
    return nearest;
  }

  getEnemyUnitsInRange(unit) {
    const attackableTiles = unit.getAttackableTiles(this.scene.tiles);

    return this.scene.units.filter((other) => {
      if (other.owner === this.name) return false;
      if (other.currentHealth <= 0) return false;
      if (!other.boundTile) return false;

      return attackableTiles.some(
        (tile) => tile.q === other.boundTile.q && tile.r === other.boundTile.r,
      );
    });
  }

  chooseAttackTarget(enemies) {
    return enemies.reduce(
      (weakest, e) => (!weakest || e.health < weakest.health ? e : weakest),
      null,
    );
  }
}
