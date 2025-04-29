-- Insert sample printer
INSERT INTO FgL.PrinterProfile (Name, Description, Location, Model, Dpi, CommandSet, IsDefault, Active)
VALUES (N'Zebra ZT230', N'Zebra ZT230 for test', N'Line 1', N'ZT230', 203, 'ZPL', 1, 1);

-- Insert sample template
INSERT INTO FgL.LabelTemplate (Name, Description, Engine, PaperSize, Orientation, Content, Version, Active)
VALUES (N'FG A6', N'Sample FG Label', 'html', 'A6', 'Portrait', N'<h1>{{batch_no}}</h1>', 1, 1); 