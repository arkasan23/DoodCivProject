--DROP DATABASE IF EXISTS civ;
CREATE DATABASE civ;
\c civ
CREATE TABLE units_data (
	name VARCHAR(30) PRIMARY KEY,
    health integer,
	damage integer,
	move_range integer,
	attack_range integer,
	cost integer,
	upgradeable boolean
);

CREATE TABLE units_state (
	id SERIAL PRIMARY KEY,
	unit_type VARCHAR(30), --units_data name
    current_health integer,
	map_pos integer, --tile #
	owned_by integer --players id
	can_move boolean --dictates if the unit has moved or not
					 --Ex: when a unit attacks, they shouldn't move anymore
);

CREATE TABLE players (
	id SERIAL PRIMARY KEY,
	name VARCHAR(30)
);

CREATE TABLE structures_data (
	name VARCHAR(30) PRIMARY KEY,
    health integer,
	cost integer
);

CREATE TABLE structures_state (
	id SERIAL PRIMARY KEY,
	structure_type VARCHAR(30), --structures_data name
    current_health integer,
	map_pos integer, --tile #
	owned_by integer
);