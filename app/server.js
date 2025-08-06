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

app.use(express.static("public"));

app.get("/get_unit", async (req, res) => {
  try {
    const unitName = req.query.unitName;
    const unit = await selectEntity.getNewUnit(unitName);
    res.json(unit);
  } catch (error) {
    console.error(error);
    res.status(500).send("Something went wrong.");
  }
});

app.listen(port, hostname, () => {
  console.log(`Listening at: http://${hostname}:${port}`);
});
