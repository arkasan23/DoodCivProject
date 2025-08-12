let { Pool } = require("pg");
let env = require("../env.json");
let pool = new Pool(env);

let table_data = {
    "units_data": [
        ["scout", 50, 0, 3, 0, 50, false],
        ["warrior", 100, 35, 1, 1, 75, true],     // upgrades into swordsman
        ["swordsman", 150, 75, 1, 1, 125, true],  // upgrades into knight
        ["knight", 200, 125, 1, 1, 175, false],
        ["slinger", 75, 50, 1, 3, 100, true],     // upgrades into archer
        ["archer", 100, 75, 1, 5, 125, true],     // upgrades into musketeer
        ["musketeer", 125, 100, 1, 6, 170, false],
        ["horseman", 175, 75, 4, 1, 175, true],   // upgrades into lancer
        ["lancer", 250, 100, 6, 2, 225, true],    // upgrades into chariot
        ["chariot", 350, 50, 8, 1, 275, false]
        
    ],
    "structures_data": [
        ["village", 35, 0],
        ["town", 100, 100],
        ["academy", 100, 200],
        ["amphitheater", 100, 200],
        ["barracks", 100, 200],
        ["tower of babel", 300, 400]
    ]
}

async function insert_data() {
    try {
        // Truncate table to prevent duplication errors
        await pool.query("TRUNCATE TABLE units_data");
        await pool.query("TRUNCATE TABLE structures_data");

        let unit_command = "INSERT INTO units_data(name, health, damage, move_range, attack_range, cost, upgradeable) VALUES($1, $2, $3, $4, $5, $6, $7)";
        let struct_command = "INSERT INTO structures_data(name, health, cost) VALUES($1, $2, $3)";

        for (const data of table_data.units_data) {
            await pool.query(unit_command, [data[0], data[1], data[2], data[3], data[4], data[5], data[6]]);
        }

        for (const data of table_data.structures_data) {
            await pool.query(struct_command, [data[0], data[1], data[2]]);
        }

    } catch (error) {
        console.error("Error inserting data:", error);
    } finally {
        await pool.end();
    }

}

insert_data();




