-- Normalize legacy sentinel and ownership values before enforcing relationships.
UPDATE `FragmentsInSample`
SET `Method_Count_Num` = NULL
WHERE `Method_Count_Num` = 0;

UPDATE `MicroplasticsInSample`
SET `Method_Count_Num` = NULL
WHERE `Method_Count_Num` = 0;

UPDATE `Location` l
INNER JOIN `users` u ON l.`UserCreated` = u.`username`
SET l.`UserCreated` = CAST(u.`User_UniqueID` AS CHAR)
WHERE l.`UserCreated` NOT REGEXP '^[0-9]+$';

ALTER TABLE `Location`
  MODIFY COLUMN `UserCreated` int(11) NOT NULL
    COMMENT 'Automatically enter logged-in UserID who is entering this location information',
  ADD CONSTRAINT `FK_Location_User`
    FOREIGN KEY (`UserCreated`) REFERENCES `users` (`User_UniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `SamplingEvent`
  MODIFY COLUMN `UserSamplingID` int(11) NOT NULL
    COMMENT 'Automatically enter logged-in UserID who is entering data',
  ADD CONSTRAINT `FK_Event_User`
    FOREIGN KEY (`UserSamplingID`) REFERENCES `users` (`User_UniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_Event_Publication`
    FOREIGN KEY (`PublicationID_Num`) REFERENCES `Publications` (`PublicationUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_Event_CurrentWeather`
    FOREIGN KEY (`Weather_Current`) REFERENCES `WeatherType_Ref` (`WeatherUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_Event_PrecedentWeather`
    FOREIGN KEY (`Weather_Precedent24`) REFERENCES `WeatherType_Ref` (`WeatherUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_Event_PrecedentWeatherLegacy`
    FOREIGN KEY (`WeatherPrecedent24`) REFERENCES `WeatherType_Ref` (`WeatherUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Publications`
  ADD CONSTRAINT `FK_Publication_Source`
    FOREIGN KEY (`PubSource_Code`) REFERENCES `PubSource_Ref` (`PubSourceUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FragmentsInSample`
  ADD CONSTRAINT `FK_Frag_CountMethod`
    FOREIGN KEY (`Method_Count_Num`) REFERENCES `Methods_Ref` (`MethodsUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_Frag_PolymerMethod`
    FOREIGN KEY (`Method_Polymer_Num`) REFERENCES `Methods_Ref` (`MethodsUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MicroplasticsInSample`
  ADD CONSTRAINT `FK_Micro_CountMethod`
    FOREIGN KEY (`Method_Count_Num`) REFERENCES `Methods_Ref` (`MethodsUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_Micro_PolymerMethod`
    FOREIGN KEY (`Method_Polymer_Num`) REFERENCES `Methods_Ref` (`MethodsUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FragmentsColorDetails`
  ADD CONSTRAINT `FK_FragColor_Fragment`
    FOREIGN KEY (`FragInSample_Num`) REFERENCES `FragmentsInSample` (`Fragment_UniqueID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_FragColor_Color`
    FOREIGN KEY (`FragColor_Num`) REFERENCES `ColorType_Ref` (`ColorUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FragmentsFormDetails`
  ADD CONSTRAINT `FK_FragForm_Form`
    FOREIGN KEY (`FragForm_Num`) REFERENCES `Form_Ref` (`FormUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `FragmentsPurposes`
  ADD CONSTRAINT `FK_FragPurpose_Purpose`
    FOREIGN KEY (`Purpose_Num`) REFERENCES `Purpose_Ref` (`PurposeUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MicroplasticsColorDetails`
  ADD CONSTRAINT `FK_MicroColor_Micro`
    FOREIGN KEY (`MicroInSample_Num`) REFERENCES `MicroplasticsInSample` (`Micro_UniqueID`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_MicroColor_Color`
    FOREIGN KEY (`MicroColor_Num`) REFERENCES `ColorType_Ref` (`ColorUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MicroplasticsFormDetails`
  ADD CONSTRAINT `FK_MicroForm_Shape`
    FOREIGN KEY (`MicroShape_Num`) REFERENCES `Form_Ref` (`FormUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `FK_MicroForm_Texture`
    FOREIGN KEY (`MicroTexture_Num`) REFERENCES `Form_Ref` (`FormUniqueID`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `FK_ResetToken_User`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`User_UniqueID`)
    ON DELETE CASCADE ON UPDATE CASCADE;
