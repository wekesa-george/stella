import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { Incident } from './entities/incident.entity';
import { KillSwitchActivation } from './entities/kill-switch-activation.entity';
import { RogueBotIncident } from './entities/rogue-bot-incident.entity';
import { IncidentCounter } from './entities/incident-counter.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Incident,
      KillSwitchActivation,
      RogueBotIncident,
      IncidentCounter,
    ]),
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule {}
