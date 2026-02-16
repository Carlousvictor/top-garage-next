// src/services/vehicleApi.js

// Função para buscar dados do veículo
// No futuro, substituir o mock por uma chamada real como:
// fetch(`https://api.placaapi.com/v1/${placa}`)

export const fetchVehicleByPlate = async (placa) => {
    // Simular delay de rede
    await new Promise(resolve => setTimeout(resolve, 1000));

    const cleanPlaca = placa.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

    // Mock de dados (Banco de dados "falso" de APIs públicas)
    const mockDb = {
        'ABC1234': {
            marca: 'Toyota',
            modelo: 'Corolla XEi 2.0',
            ano: '2021',
            cor: 'Preto',
            combustivel: 'Flex'
        },
        'XYZ9876': {
            marca: 'Honda',
            modelo: 'Civic Touring 1.5 Turbo',
            ano: '2020',
            cor: 'Branco',
            combustivel: 'Gasolina'
        },
        'TOP2024': {
            marca: 'Fiat',
            modelo: 'Toro Volcano Diesel',
            ano: '2023',
            cor: 'Vermelho',
            combustivel: 'Diesel'
        }
    };

    if (mockDb[cleanPlaca]) {
        return mockDb[cleanPlaca];
    }

    // Gerador aleatório para placas desconhecidas (fallback)
    const marcas = ['Chevrolet', 'Volkswagen', 'Ford', 'Hyundai', 'Jeep'];
    const modelos = {
        'Chevrolet': ['Onix', 'Tracker', 'Cruze'],
        'Volkswagen': ['Polo', 'T-Cross', 'Nivus'],
        'Ford': ['Ranger', 'Territory', 'Mustang'],
        'Hyundai': ['HB20', 'Creta', 'Tucson'],
        'Jeep': ['Compass', 'Renegade', 'Commander']
    };

    const randomMarca = marcas[Math.floor(Math.random() * marcas.length)];
    const randomModelos = modelos[randomMarca];
    const randomModelo = randomModelos[Math.floor(Math.random() * randomModelos.length)];
    const cores = ['Prata', 'Cinza', 'Azul', 'Branco', 'Preto'];

    return {
        marca: randomMarca,
        modelo: randomModelo,
        ano: 2018 + Math.floor(Math.random() * 7), // 2018 a 2024
        cor: cores[Math.floor(Math.random() * cores.length)],
        combustivel: 'Flex'
    };
};
