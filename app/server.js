const pg = require("pg");
const express = require("express");
const app = express();
const port = 3000;
const hostname = "localhost";
const env = require("../env.json");
const Pool = pg.Pool;
const pool = new Pool(env);
pool.connect().then(function () {
  console.log(`Connected to database ${env.database}`);
});
const SelectEntity = require('./selectEntity');
const selectEntity = new SelectEntity(pool);
const Combat = require('./public/combat');
const combat = new Combat(pool);

app.use(express.static("public"));
app.use(express.json());

// Returns all units from units_state
app.get("/get_all_units", async (req, res) => {
  try {
    const result = await selectEntity.getAllUnits(); 
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching all units.");
  }
});


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
    const unit = await selectEntity.getUnitState(id);
    res.json(unit);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error getting unit state.");
  }
});

// for when a new unit is bought
// TODO: check this 
app.get("/initiate_unit", (req, res) => {
  try {
    const unitName = req.query.unitName;
    fetch(`http://localhost:3000/get_unit?unitName=${unitName}`)
    const q_pos = req.query.q_pos;
    const r_pos = req.query.r_pos;
    const player = req.query.player;
    this.then(async (response) => {
      const unit = await response.json();
      await selectEntity.initiateUnit(unit.name, unit.health, player, q_pos, r_pos, true);
      // console.log(id);
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
    // requires positions for both player and enemy units

    const attackId = req.query.attackId;
    const enemyId = req.query.enemyId;
    
    const attackUnitType = await selectEntity.getUnitType(attackId);
    const attackPos = await selectEntity.getUnitPosition(attackId);
    const range = await selectEntity.getUnitRange(attackUnitType);
    const enemyPos = await selectEntity.getUnitPosition(enemyId);
    
    // bool value
    const inRange = await combat.check_range(attackPos.q_pos, attackPos.r_pos, range, enemyPos.q_pos, enemyPos.r_pos); // change this
   
    res.json(inRange);
  } catch (error) {
    res.status(500).send("Error getting unit.");
  }

});

// called when units are attacking one another
// this function should get both the attacker and victim and update both units in the table 
// only called when the above get function, "get_unit_id" is true
app.get("/combat", async (req, res) => {
  try {
    const attackerId = parseInt(req.query.attackerId);
    const victimId = parseInt(req.query.victimId);

    const result = await combat.attack(attackerId, victimId);
    res.json(result);

  } catch (error) {
    console.error(error);
    res.status(500).send("Error in combat.");
  }

});

// adds player to players table
app.post("/add_player", async (req, res) => {
  const { player } = req.body;
  await pool.query("INSERT INTO players (name) VALUES ($1)", [player]);
  res.send();
});

// clear given table
app.get("/clear_table", async (req, res) => {
  try {
    const name = req.query.name;
    await pool.query(`TRUNCATE TABLE ${name} RESTART IDENTITY`);
    return res.send();
  } catch (error) {
    console.error(error);
    return res.status(500).send(`Error clearing table.`);
  }
});

app.get("/get_gold", async (req, res) => {
  try {
    const player = req.query.player;
    const result = await pool.query("SELECT gold FROM players WHERE name = $1", [player]);
    return res.json(result.rows[0]);
  } catch (error) {
    console.log(error);
    return res.status(500).send("Error getting gold.");
  }
});

app.put("/set_gold", async (req, res) => {
  try {
    const { name, gold } = req.body;
    await pool.query("UPDATE players SET gold = $1 WHERE name = $2", [gold, name]);
    res.send();
  } catch (error) {
    console.log(error);
    return res.status(500).send("Error setting gold.");
  }
  
});

app.listen(port, hostname, () => {
  console.log(`Listening at: http://${hostname}:${port}`);
});
