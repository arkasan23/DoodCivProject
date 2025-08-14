const pg = require("pg");
const express = require("express");
const app = express();
const port = 3000;
const hostname = "localhost";
const env = require("../env.json");
// const env = require("../env_sample.json");
const Pool = pg.Pool;
const pool = new Pool(env);
pool.connect().then(function () {
  console.log(`Connected to database ${env.database}`);
});
const SelectEntity = require('./public/selectEntity');
const selectEntity = new SelectEntity(pool);
const Combat = require('./public/combat');
const combat = new Combat(pool);

app.use(express.static("public"));

// get the unit from the units_data table
app.get("/get_unit", async (req, res) => {
  try {
    const unitName = req.query.unitName;
    const unit = await selectEntity.getNewUnit(unitName);
    res.json(unit);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error getting unit.");
  }
});

// get the unit from the units_state table
app.get("/get_unit_state", async (req, res) => {
  // Ex: "/get_unit_state?id=2"
  try {
    const id = req.query.id;
    const unit = await selectEntity.getNewUnit(id);
    res.json(unit);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error getting unit.");
  }
});

// for when a new unit is bought
app.get("/initiate_unit", (req, res) => {
  try {
    const unitName = req.query.unitName;
    fetch(`http://localhost:3000/get_unit?unitName=${unitName}`)
    // const mapPos = req.query.mapPos; // change this
    // const player = req.query.player;
    .then(async (response) => {
      const unit = await response.json();
      await selectEntity.initiateUnit(unit, mapPos, player); // change this
      console.log(id);
      res.send();
    })
  } catch (error) {
    console.error(error);
    res.status(500).send("Error initiating unit.");
  }
});

// basically, gets the chosen unit's range, look around for enemy units
// send true if in range and can attack -> send to "/get_combat_units"
app.get("/detect_units", async (req, res) => {
  try {
    // THIS IS NOT FINISHED
    // requires positions for both player and enemy units
    // also how we query for enemy and player units
    const unitName = req.query.unitName;
    const enemyId = req.query.enemyId;
    // const mapPos = req.query.mapPos // change this
    
    
    const movement = await selectEntity.getUnitMovement(unitName);
    const range = await selectEntity.getUnitRange(unitName);
    const enemyPos = await selectEntity.getUnitPosition(enemyId);
    
    // check_range is currently not fully finished
    await combat.check_range(mapPos, movement, range, enemyPos); // change this
   
    res.json(unit);
  } catch (error) {
    res.status(500).send("Error getting unit.");
  }

});

// called when units are attacking one another
// this function should get both the attacker and victim and update both units in the table 
// only called when the above get function, "get_unit_id" is true
app.get("/get_combat_units", async (req, res) => {
  try {
    const attackerName = req.query.unitName;
    const victimId = req.query.unitId;
    // const attackerId = req.query.unitId;

    const attackerDmg = await selectEntity.getUnitDamage(attackerName);
    const victimHP = await selectEntity.getUnitHealth(victimId);

    // function attack should update the values of the victim
    combat.attack(attackerDmg, victimHP);

    
    // fetch(`http://localhost:3000/get_unit?unitName=${unitName}`)

  } catch (error) {
    res.status(500).send("Error getting unit.");
  }

});


app.listen(port, hostname, () => {
  console.log(`Listening at: http://${hostname}:${port}`);
});
