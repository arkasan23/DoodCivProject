CREATE DATABASE civ;
\c civ
CREATE TABLE units_data (
	id SERIAL PRIMARY KEY,
	name VARCHAR(30),
    health integer,
	damage integer,
	move_range integer,
	attack_range integer,
	cost integer
);

CREATE TABLE units_state (
	id SERIAL PRIMARY KEY,
	unit_type integer, --units_data id
    current_health integer,
	map_pos integer, --tile #
	owned_by integer --players id
);

CREATE TABLE players (
	id SERIAL PRIMARY KEY,
	name VARCHAR(30)
);

CREATE TABLE structures_data (
	id SERIAL PRIMARY KEY,
	name VARCHAR(30),
    health integer,
	cost integer
);

CREATE TABLE structures_state (
	id SERIAL PRIMARY KEY,
	structure_type integer, --structures_data id
    current_health integer,
	map_pos integer, --tile #
	owned_by integer
);