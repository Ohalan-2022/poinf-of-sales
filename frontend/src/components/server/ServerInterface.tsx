import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { toastHelpers } from '@/lib/toast-helpers'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  Minus, 
  ShoppingCart, 
  Users, 
  User,
  Check,
  Clock,
  Table as TableIcon,
  Search,
  Settings,
  Package
} from 'lucide-react'
import type { Product, DiningTable } from '@/types'

interface CartItem {
  product: Product
  quantity: number
  special_instructions?: string
}

interface CreateOrderRequest {
  order_type: 'dine_in' | 'takeout' | 'delivery'
  table_id: string
  customer_name?: string
  items: Array<{
    product_id: string
    quantity: number
    special_instructions?: string
  }>
  notes?: string
}

export function ServerInterface() {
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderNotes, setOrderNotes] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showTableView, setShowTableView] = useState(false)
  
  const queryClient = useQueryClient()

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const response = await apiClient.getCategories()
        return response.data || []
      } catch (error) {
        console.error('Failed to fetch categories:', error)
        return []
      }
    }
  })

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ['products', selectedCategory],
    queryFn: async () => {
      try {
        let response
        if (selectedCategory === 'all') {
          response = await apiClient.getProducts()
        } else {
          response = await apiClient.getProductsByCategory(selectedCategory)
        }
        return response.data || []
      } catch (error) {
        console.error('Failed to fetch products:', error)
        return []
      }
    }
  })

  // Fetch available tables (not occupied)
  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => {
      try {
        const response = await apiClient.getTables()
        return response.data || []
      } catch (error) {
        console.error('Failed to fetch tables:', error)
        return []
      }
    }
  })

  // Fetch active orders to show table status
  const { data: activeOrders = [] } = useQuery({
    queryKey: ['active-orders'],
    queryFn: async () => {
      try {
        const response = await apiClient.getOrders({ status: 'pending,confirmed,preparing,ready' })
        return response.data || []
      } catch (error) {
        console.error('Failed to fetch active orders:', error)
        return []
      }
    }
  })

  // Create order mutation (server endpoint - dine-in only)
  const createOrderMutation = useMutation({
    mutationFn: (orderData: CreateOrderRequest) => 
      apiClient.createServerOrder(orderData),
    onSuccess: (data) => {
      const orderNumber = data.data?.order_number
      // Reset form
      setCart([])
      setSelectedTable(null)
      setCustomerName('')
      setOrderNotes('')
      
      // Refresh data
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['active-orders'] })
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      
      toastHelpers.orderCreated(orderNumber)
    },
    onError: (error: any) => {
      toastHelpers.apiError('Create order', error)
    }
  })

  // Filter products based on search
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  )

  // Helper function to get table status
  const getTableStatus = (table: DiningTable) => {
    // Ensure activeOrders is always an array
    const orders = Array.isArray(activeOrders) ? activeOrders : []
    const hasActiveOrder = orders.some(order => order.table_id === table.id)
    
    if (table.is_occupied && hasActiveOrder) {
      return { status: 'occupied', label: 'Occupied', color: 'bg-red-100 text-red-800 border-red-200' }
    } else if (hasActiveOrder) {
      return { status: 'pending', label: 'Order Pending', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' }
    } else if (table.is_occupied) {
      return { status: 'seated', label: 'Seated', color: 'bg-blue-100 text-blue-800 border-blue-200' }
    } else {
      return { status: 'available', label: 'Available', color: 'bg-green-100 text-green-800 border-green-200' }
    }
  }

  // Available tables (not occupied or ready for new orders)
  const availableTables = tables.filter(table => !table.is_occupied)
  
  // All tables with status for restaurant view
  const tablesWithStatus = tables.map(table => {
    const orders = Array.isArray(activeOrders) ? activeOrders : []
    return {
      ...table,
      statusInfo: getTableStatus(table),
      activeOrder: orders.find(order => order.table_id === table.id)
    }
  })

  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.product.id === product.id)
    
    if (existingItem) {
      setCart(cart.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
    } else {
      setCart([...cart, { product, quantity: 1 }])
    }
  }

  const removeFromCart = (productId: string) => {
    const existingItem = cart.find(item => item.product.id === productId)
    
    if (existingItem && existingItem.quantity > 1) {
      setCart(cart.map(item =>
        item.product.id === productId
          ? { ...item, quantity: item.quantity - 1 }
          : item
      ))
    } else {
      setCart(cart.filter(item => item.product.id !== productId))
    }
  }

  const getTotalAmount = () => {
    return cart.reduce((total, item) => total + (item.product.price * item.quantity), 0)
  }

  const handleCreateOrder = () => {
    if (!selectedTable || cart.length === 0) return

    const orderData: CreateOrderRequest = {
      order_type: 'dine_in',
      table_id: selectedTable.id,
      customer_name: customerName || undefined,
      items: cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        special_instructions: item.special_instructions
      })),
      notes: orderNotes || undefined
    }

    createOrderMutation.mutate(orderData)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar - Categories and Products */}
      <div className="w-2/3 border-r border-border overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">🍽️ Server Station</h1>
              <p className="text-muted-foreground">Take orders for your tables • Provide excellent service</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                <Users className="w-4 h-4 mr-1" />
                Dine-In Service
              </Badge>
              {Array.isArray(activeOrders) && activeOrders.length > 0 && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                  {activeOrders.length} Active Orders
                </Badge>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto">
            <Button
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('all')}
            >
              All Items
            </Button>
            {categories.map(category => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category.id)}
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProducts.map(product => {
              const cartItem = cart.find(item => item.product.id === product.id)
              return (
                <Card key={product.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg leading-tight">{product.name}</CardTitle>
                        {product.description && (
                          <CardDescription className="text-sm mt-1">
                            {product.description.substring(0, 60)}
                            {product.description.length > 60 ? '...' : ''}
                          </CardDescription>
                        )}
                      </div>
                      <div className="text-lg font-bold text-primary">
                        {formatCurrency(product.price)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {product.preparation_time > 0 && (
                          <Badge variant="outline" className="text-xs">
                            <Clock className="w-3 h-3 mr-1" />
                            {product.preparation_time}min
                          </Badge>
                        )}
                        {!product.is_available && (
                          <Badge variant="secondary" className="text-xs">
                            Unavailable
                          </Badge>
                        )}
                      </div>

                      {product.is_available && (
                        <div className="flex items-center gap-2">
                          {cartItem ? (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => removeFromCart(product.id)}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="w-8 text-center font-medium">
                                {cartItem.quantity}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addToCart(product)}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => addToCart(product)}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Cart and Order */}
      <div className="w-1/3 flex flex-col bg-card">
        {/* Table Selection */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center">
              <TableIcon className="w-4 h-4 mr-2" />
              Select Table
            </h3>
            <div className="flex gap-1">
              <Button
                variant={!showTableView ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowTableView(false)}
              >
                List
              </Button>
              <Button
                variant={showTableView ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowTableView(true)}
              >
                Floor
              </Button>
            </div>
          </div>

          {!showTableView ? (
            // Simple List View - Only Available Tables
            <>
              <div className="grid grid-cols-3 gap-2">
                {availableTables.slice(0, 9).map(table => (
                  <Button
                    key={table.id}
                    variant={selectedTable?.id === table.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTable(table)}
                    className="h-12"
                  >
                    {table.table_number}
                    <span className="text-xs block">
                      {table.seating_capacity} seats
                    </span>
                  </Button>
                ))}
              </div>
              {availableTables.length > 9 && (
                <p className="text-xs text-muted-foreground mt-2">
                  +{availableTables.length - 9} more tables available
                </p>
              )}
            </>
          ) : (
            // Restaurant Floor View - All Tables with Status
            <div className="space-y-3">
              {/* Status Legend */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 border border-green-200">
                  Available
                </span>
                <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  Seated
                </span>
                <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200">
                  Order Pending
                </span>
                <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 border border-red-200">
                  Occupied
                </span>
              </div>

              {/* Table Grid */}
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                {tablesWithStatus.map(table => {
                  const canSelect = table.statusInfo.status === 'available' || table.statusInfo.status === 'seated'
                  return (
                    <Button
                      key={table.id}
                      variant={selectedTable?.id === table.id ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => canSelect && setSelectedTable(table)}
                      disabled={!canSelect}
                      className={`h-14 flex flex-col p-2 relative ${
                        canSelect ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                      }`}
                    >
                      <div className="font-semibold text-sm">T{table.table_number}</div>
                      <div className="text-xs">{table.seating_capacity} seats</div>
                      
                      {/* Status indicator */}
                      <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
                        table.statusInfo.status === 'available' ? 'bg-green-500' :
                        table.statusInfo.status === 'seated' ? 'bg-blue-500' :
                        table.statusInfo.status === 'pending' ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`} />
                      
                      {/* Active order indicator */}
                      {table.activeOrder && (
                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 text-xs bg-yellow-200 text-yellow-800 px-1 py-0.5 rounded text-[10px]">
                          Order #{table.activeOrder.order_number?.slice(-4)}
                        </div>
                      )}
                    </Button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Selected Table Info */}
          {selectedTable && (
            <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm font-medium text-blue-900">
                Selected: Table {selectedTable.table_number}
              </div>
              <div className="text-xs text-blue-700">
                Capacity: {selectedTable.seating_capacity} guests
                {selectedTable.location && ` • Location: ${selectedTable.location}`}
              </div>
            </div>
          )}
        </div>

        {/* Customer Info */}
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold mb-2 flex items-center">
            <User className="w-4 h-4 mr-2" />
            Guest Information
          </h3>
          <div className="space-y-2">
            <Input
              placeholder="Guest name (optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            {selectedTable && (
              <div className="text-xs text-muted-foreground">
                💡 Tip: Greet guests warmly and confirm their table preference
              </div>
            )}
          </div>
        </div>

        {/* Quick Server Actions */}
        {selectedTable && (
          <div className="px-4 py-2 border-b border-border bg-blue-50/50">
            <div className="text-xs text-blue-700 mb-2">Quick Actions for Table {selectedTable.table_number}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs">
                <Settings className="w-3 h-3 mr-1" />
                Table Settings
              </Button>
              <Button variant="outline" size="sm" className="text-xs">
                <Package className="w-3 h-3 mr-1" />
                Specials
              </Button>
            </div>
          </div>
        )}

        {/* Cart */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <h3 className="font-semibold mb-3 flex items-center">
              <ShoppingCart className="w-4 h-4 mr-2" />
              Order Items ({cart.length})
            </h3>
            
            {cart.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Ready to take an order</p>
                <p className="text-sm">
                  {selectedTable 
                    ? `Taking order for Table ${selectedTable.table_number}`
                    : 'Select a table and add items to get started'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map(item => (
                  <div key={item.product.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.product.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(item.product.price)} × {item.quantity}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <div className="font-medium">
                        {formatCurrency(item.product.price * item.quantity)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromCart(item.product.id)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => addToCart(item.product)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Order Notes */}
            {cart.length > 0 && (
              <div className="mt-4">
                <label className="text-sm font-medium">Order Notes</label>
                <Input
                  placeholder="Special requests or notes..."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
          </div>
        </div>

        {/* Order Summary and Actions */}
        {cart.length > 0 && (
          <div className="p-4 border-t border-border bg-card">
            <div className="space-y-3">
              {/* Order Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-blue-700">
                    {selectedTable ? `Table ${selectedTable.table_number}` : 'No table selected'}
                  </span>
                  <span className="text-sm text-blue-700">
                    {cart.length} {cart.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <div className="flex justify-between text-lg font-semibold text-blue-900">
                  <span>Order Total:</span>
                  <span>{formatCurrency(getTotalAmount())}</span>
                </div>
              </div>

              {/* Action Button */}
              <Button
                className="w-full"
                size="lg"
                onClick={handleCreateOrder}
                disabled={!selectedTable || cart.length === 0 || createOrderMutation.isPending}
              >
                {createOrderMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Sending to Kitchen...
                  </>
                ) : !selectedTable ? (
                  <>
                    <TableIcon className="w-4 h-4 mr-2" />
                    Select a Table First
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Send Order to Kitchen
                  </>
                )}
              </Button>

              {/* Server Tips */}
              <div className="text-xs text-center text-muted-foreground">
                💡 Double-check the order with guests before submitting
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
