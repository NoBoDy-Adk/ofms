create database ofms_dbms;
use ofms_dbms;
create table supplier(
    supplier_id CHAR(36) PRIMARY KEY DEFAULT (UUID()),
	name varchar(255),
	address varchar(255),
	phone_number varchar(20)
);
create table supplier_receiver(
	supplier_id varchar(255),
	receiver_no varchar(20),
	receiver_name varchar(255),
	foreign key(supplier_id) references supplier(supplier_id)
    on delete cascade
);
create table Transport_Vessel (
	ship_id varchar(255) primary key,
	name varchar(255),
	type varchar(255),
	capacity int,
	owner_id varchar(255)
);
create table port_arrival(
	arrival_port_id varchar(255) primary key ,
	port_name varchar(255),
	port_location varchar(255)
);
create table port_departure(
	departure_port_id varchar(255) primary key,
	port_name varchar(255),
	port_location varchar(255)
);
CREATE TABLE Product (
    product_id varchar(255) PRIMARY KEY DEFAULT (UUID()),
    description varchar(255),
    volume DECIMAL(10, 2),
    order_id varchar(255),
    supplier_id varchar(255),
    FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id)
    on delete cascade
);
CREATE TABLE Sign_In_User_Details (
    unique_user_id varchar(255) PRIMARY KEY DEFAULT (UUID()),
    contact_number VARCHAR(20) unique,
    supplier_id varchar(255),
    signin_password varchar(255),
    FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id)
    on delete cascade
);
CREATE TABLE Sign_In_User_Details_email (
    unique_user_id varchar(255),
    email VARCHAR(255),
    PRIMARY KEY (unique_user_id, email),
    FOREIGN KEY (unique_user_id) REFERENCES Sign_In_User_Details(unique_user_id)
    on delete cascade
);
CREATE TABLE order_details (
    order_id varchar(255) PRIMARY KEY DEFAULT (UUID()),
    product_id varchar(255),
    supplier_id varchar(255),
    order_date DATE,
    shipment_id varchar(255),
    FOREIGN KEY (product_id) REFERENCES Product(product_id)
    on delete cascade,
    FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id)
    on delete cascade
);
CREATE TABLE shipment (
    shipment_id varchar(255) PRIMARY KEY DEFAULT (UUID()),
    order_id varchar(255),
    shipment_date DATE,
    estimated_arrival_date DATE,
    FOREIGN KEY (order_id) REFERENCES order_details(order_id)
    on delete cascade
);
CREATE TABLE Arrival (	
    shipment_id varchar(255),
    arrival_port_id varchar(255),
    PRIMARY KEY (shipment_id, arrival_port_id),
    FOREIGN KEY (shipment_id) REFERENCES Shipment(shipment_id)
    on delete cascade,
    FOREIGN KEY (arrival_port_id) REFERENCES port_arrival(arrival_port_id)
    on delete cascade
);
CREATE TABLE Departure (
    shipment_id varchar(255),
    departure_port_id varchar(255),
    PRIMARY KEY (shipment_id, departure_port_id),
    FOREIGN KEY (shipment_id) REFERENCES Shipment(shipment_id)
    on delete cascade,
    FOREIGN KEY (departure_port_id) REFERENCES port_departure(departure_port_id)
    on delete cascade
);

CREATE TABLE sign_in (
    unique_user_id VARCHAR(255),
    sign_in_timestamp DATETIME,
    FOREIGN KEY (unique_user_id) REFERENCES Sign_In_User_Details(unique_user_id) ON DELETE CASCADE
);

