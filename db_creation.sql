create table book(
	id BIGSERIAL primary key,
	book_name VARCHAR (128),
	book_author VARCHAR(128),
	read_date DATE,
	recomendation_score VARCHAR(5),
	read_recomendation VARCHAR(2048),
	book_notes VARCHAR(8192),
	buy_url VARCHAR(512),
	book_image VARCHAR(256),
	category VARCHAR(64)
);