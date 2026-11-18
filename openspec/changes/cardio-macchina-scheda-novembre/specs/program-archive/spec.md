# Spec Delta

## Purpose

Cambiare la scheda di allenamento quando il trainer ne consegna una nuova, senza perdere lo storico delle sessioni e potendo rivedere le schede precedenti in sola lettura.

## ADDED Requirements

### Requirement: Versione e nome della scheda
La scheda SHALL avere un numero di versione intero crescente e MAY avere un nome e una data di inizio. Ogni sessione SHALL registrare la versione della scheda con cui è stata fatta.

#### Scenario: Sessione con la scheda nuova
- **WHEN** l'utente avvia "Giorno 1" con la scheda versione 2
- **THEN** la sessione salvata riporta la versione 2

### Requirement: Storico conservato al cambio scheda
Sostituire la scheda SHALL NOT modificare né rimuovere le sessioni salvate. Un esercizio con lo stesso id nella scheda nuova SHALL continuare storico e grafico; un esercizio non più presente SHALL comparire in "Non più in scheda" con il suo storico.

#### Scenario: Esercizio che prosegue
- **WHEN** la scheda nuova mantiene l'id "pulley-triangolo" con 6-8 ripetizioni
- **THEN** il grafico di "Pulley con triangolo" mostra sia le sessioni a 8-10 sia quelle nuove

#### Scenario: Esercizio tolto
- **WHEN** la scheda nuova non contiene più "goblet-squat-alzata"
- **THEN** lo storico lo elenca in "Non più in scheda" con le sessioni fatte

### Requirement: Archivio delle schede precedenti
L'app SHALL offrire una voce "Schede precedenti" che elenca le schede archiviate con nome e periodo. Aprendone una SHALL mostrarne gli allenamenti con fasi, esercizi, serie, obiettivi e recuperi in sola lettura, senza poter avviare una sessione.

#### Scenario: Consultare la scheda di settembre
- **WHEN** l'utente apre "Schede precedenti" e sceglie la versione 1
- **THEN** vede Giorno 1, Giorno 2 e Giorno 3 con gli esercizi di quella scheda e nessun pulsante "Inizia"

#### Scenario: Nessuna scheda archiviata
- **WHEN** l'archivio è vuoto
- **THEN** la voce "Schede precedenti" non compare

### Requirement: Archivio disponibile offline
Le schede archiviate SHALL essere consultabili senza connessione dopo il primo avvio con la versione che le contiene.

#### Scenario: Offline in palestra
- **WHEN** l'app è stata aperta una volta online dopo l'aggiornamento e poi si apre offline
- **THEN** "Schede precedenti" mostra la versione 1

### Requirement: Archivio non valido
Un file d'archivio illeggibile o non valido SHALL produrre un messaggio d'errore nella vista dell'archivio senza bloccare il resto dell'app.

#### Scenario: Scheda archiviata corrotta
- **WHEN** il file della versione 1 non è JSON valido
- **THEN** la vista mostra "Scheda non disponibile" e home, sessione e storico funzionano
