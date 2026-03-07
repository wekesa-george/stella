import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { EscalationService } from './escalation.service';
import { EscalationController, IncidentEscalationController } from './escalation.controller';
import { Incident } from './entities/incident.entity';
import { KillSwitchActivation } from './entities/kill-switch-activation.entity';
import { RogueBotIncident } from './entities/rogue-bot-incident.entity';
import { IncidentCounter } from './entities/incident-counter.entity';
import { EscalationMatrix } from './entities/escalation-matrix.entity';
import { EscalationLog } from './entities/escalation-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Incident,
      KillSwitchActivation,
      RogueBotIncident,
      IncidentCounter,
      EscalationMatrix,
      EscalationLog,
    ]),
  ],
  controllers: [IncidentsController, EscalationController, IncidentEscalationController],
  providers: [IncidentsService, EscalationService],
  exports: [EscalationService],
})
export class IncidentsModule {}
