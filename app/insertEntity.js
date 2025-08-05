let { Pool } = require("pg");
let env = require("../env.json");
let pool = new Pool(env);

// "DROP TABLE units_data;"
// "DROP TABLE structures_data;"


let table_data = {
    "units_data": [
        [0, "scout", 50, 0, 3, 0, 50],
        [1, "warrior", 100, 35, 1, 1, 75],
        [2, "swordsman", 150, 75, 1, 1, 125],
        [3, "knight", 200, 125, 1, 1, 175],
        [4, "slinger", 75, 50, 1, 3, 100],
        [5, "archer", 100, 75, 1, 5, 125],
        [6, "musketeer", 125, 100, 1, 6, 170],
        [7, "horseman", 175, 75, 4, 1, 175],
        [8, "lancer", 250, 100, 6, 2, 225],
        [9, "chariot", 350, 50, 8, 1, 275]
        
    ],
    "structures_data": [
        [10, "village", 35, 0],
        [20, "town", 100, 100],
        [30, "academy", 100, 200],
        [40, "amphitheater", 100, 200],
        [50, "barracks", 100, 200],
        [60, "tower of babel", 300, 400]
    ]
}

async function insert_data() {
    try {
        await pool.query("TRUNCATE TABLE units_data");
        await pool.query("TRUNCATE TABLE structures_data");

        let unit_command = "INSERT INTO units_data(id, name, health, damage, move_range, attack_range, cost) VALUES($1, $2, $3, $4, $5, $6, $7)";
        let struct_command = "INSERT INTO structures_data (id, name, health, cost) VALUES($1, $2, $3, $4)";


        for (const data of table_data.units_data) {
            await pool.query(unit_command, [data[0], data[1], data[2], data[3], data[4], data[5], data[6]]);
        }

        for (const data of table_data.structures_data) {
            await pool.query(struct_command, [data[0], data[1], data[2], data[3]]);
        }

    } catch (error) {
        console.error("Error inserting data:", error);
    } finally {
        await pool.end();
    }

}

insert_data();




